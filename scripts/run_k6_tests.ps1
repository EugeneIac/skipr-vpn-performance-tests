# K6 Performance Tests Runner for CI/CD (PowerShell)
# Runs k6 tests in Docker with environment-based configuration

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet('test', 'dev', 'staging', 'prod')]
    [string]$Environment = $env:TEST_ENV ?? 'test',
    
    [Parameter(Mandatory=$false)]
    [int]$MaxVUs = [int]($env:MAX_VUS ?? 50),
    
    [Parameter(Mandatory=$false)]
    [ValidateSet('smoke', 'baseline', 'load', 'stress', 'full')]
    [string]$TestType = $env:TEST_TYPE ?? 'full',
    
    [Parameter(Mandatory=$false)]
    [int]$Duration = [int]($env:TEST_DURATION ?? 5)
)

$ErrorActionPreference = "Continue"
$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$ResultsDir = "results\${TestType}-${Environment}-${Timestamp}"
$K6Image = "grafana/k6:latest"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "K6 Performance Tests" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Environment:  " -NoNewline; Write-Host $Environment -ForegroundColor Yellow
Write-Host "Max VUs:      " -NoNewline; Write-Host $MaxVUs -ForegroundColor Yellow
Write-Host "Test Type:    " -NoNewline; Write-Host $TestType -ForegroundColor Yellow
Write-Host "Duration:     " -NoNewline; Write-Host "${Duration}m" -ForegroundColor Yellow
Write-Host "Results:      " -NoNewline; Write-Host $ResultsDir -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Cyan

# Create results directory
New-Item -ItemType Directory -Force -Path $ResultsDir | Out-Null

# Get project root
$ProjectRoot = (Get-Location).Path

# Check Docker
Write-Host "Checking Docker..." -ForegroundColor Yellow
$dockerExists = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerExists) {
    Write-Host "ERROR: Docker not installed!" -ForegroundColor Red
    exit 1
}

docker ps | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker is not running!" -ForegroundColor Red
    exit 1
}
Write-Host "Docker is running`n" -ForegroundColor Green

# Check k6 build
Write-Host "Checking k6 build..." -ForegroundColor Yellow
$K6Path = Join-Path $ProjectRoot "k6"
if (-not (Test-Path "$K6Path\dist\instant-servers.test.js")) {
    Write-Host "Build not found. Running npm run build..." -ForegroundColor Yellow
    Set-Location "$K6Path"
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Build failed!" -ForegroundColor Red
        Set-Location $ProjectRoot
        exit 1
    }
    Set-Location $ProjectRoot
}
Write-Host "Build ready`n" -ForegroundColor Green

# Function to run k6 test
function Run-K6Test {
    param(
        [string]$TestFile,
        [string]$TestName,
        [int]$VUs,
        [string]$TestDuration
    )
    
    Write-Host "Running: $TestName" -ForegroundColor Yellow
    Write-Host "Test file: $TestFile"
    Write-Host "VUs: $VUs, Duration: $TestDuration`n"
    
    $K6Mount = "${ProjectRoot}\k6:/k6"
    $ResultsMount = "${ProjectRoot}\results:/results"
    $OutputPath = "/results/${TestName}.json"
    $TestPath = "/k6/dist/${TestFile}"
    
    $allArgs = @(
        "run", "--rm", "--network", "host",
        "-v", $K6Mount,
        "-v", $ResultsMount,
        "-e", "K6_ENV=${Environment}",
        "-e", "K6_MAX_VUS=${MaxVUs}",
        $K6Image,
        "run",
        "--insecure-skip-tls-verify",
        "--out", "json=${OutputPath}",
        "--vus", $VUs,
        "--duration", $TestDuration,
        $TestPath
    )
    
    & docker $allArgs
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ $TestName failed" -ForegroundColor Red
        return $false
    }
    
    Write-Host "✓ $TestName completed`n" -ForegroundColor Green
    return $true
}

# Calculate scaled VUs
function Get-ScaledVUs {
    param([int]$Base, [int]$Max)
    return [Math]::Min($Base, $Max)
}

# Run tests based on type
switch ($TestType) {
    'smoke' {
        Write-Host "`n=== SMOKE TEST ===`n" -ForegroundColor Cyan
        Run-K6Test -TestFile "instant-servers.test.js" -TestName "smoke-test" -VUs 1 -TestDuration "30s"
    }
    
    'baseline' {
        Write-Host "`n=== BASELINE TEST ===`n" -ForegroundColor Cyan
        $BaselineVUs = Get-ScaledVUs -Base 10 -Max $MaxVUs
        Run-K6Test -TestFile "e2e-simple.test.js" -TestName "baseline-test" -VUs $BaselineVUs -TestDuration "${Duration}m"
    }
    
    'load' {
        Write-Host "`n=== LOAD TEST ===`n" -ForegroundColor Cyan
        $LoadVUs = Get-ScaledVUs -Base 50 -Max $MaxVUs
        Run-K6Test -TestFile "e2e-simple.test.js" -TestName "load-test" -VUs $LoadVUs -TestDuration "${Duration}m"
    }
    
    'stress' {
        Write-Host "`n=== STRESS TEST ===`n" -ForegroundColor Cyan
        Run-K6Test -TestFile "e2e-simple.test.js" -TestName "stress-test" -VUs $MaxVUs -TestDuration "${Duration}m"
    }
    
    'full' {
        Write-Host "`n=== FULL TEST SUITE ===`n" -ForegroundColor Cyan
        
        # Phase 1: Smoke Test
        Write-Host "Phase 1: Smoke Test" -ForegroundColor Cyan
        if (-not (Run-K6Test -TestFile "instant-servers.test.js" -TestName "phase1-smoke" -VUs 1 -TestDuration "30s")) { exit 1 }
        Start-Sleep -Seconds 10
        
        # Phase 2: Single E2E
        Write-Host "Phase 2: Single E2E" -ForegroundColor Cyan
        if (-not (Run-K6Test -TestFile "e2e-simple.test.js" -TestName "phase2-single-e2e" -VUs 1 -TestDuration "1m")) { exit 1 }
        Start-Sleep -Seconds 10
        
        # Phase 3: Baseline
        Write-Host "Phase 3: Baseline" -ForegroundColor Cyan
        $BaselineVUs = Get-ScaledVUs -Base 10 -Max $MaxVUs
        if (-not (Run-K6Test -TestFile "e2e-simple.test.js" -TestName "phase3-baseline" -VUs $BaselineVUs -TestDuration "5m")) { exit 1 }
        Start-Sleep -Seconds 30
        
        # Phase 4: Load Test
        if ($MaxVUs -ge 25) {
            Write-Host "Phase 4: Load Test" -ForegroundColor Cyan
            $LoadVUs = Get-ScaledVUs -Base 50 -Max $MaxVUs
            if (-not (Run-K6Test -TestFile "e2e-simple.test.js" -TestName "phase4-load" -VUs $LoadVUs -TestDuration "10m")) { exit 1 }
            Start-Sleep -Seconds 30
        }
        
        # Phase 5: Stress Test
        if ($MaxVUs -ge 50) {
            Write-Host "Phase 5: Stress Test" -ForegroundColor Cyan
            if (-not (Run-K6Test -TestFile "e2e-simple.test.js" -TestName "phase5-stress" -VUs $MaxVUs -TestDuration "15m")) { exit 1 }
        }
    }
    
    default {
        Write-Host "ERROR: Unknown test type: $TestType" -ForegroundColor Red
        Write-Host "Valid types: smoke, baseline, load, stress, full"
        exit 1
    }
}

# Summary
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Tests Completed Successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Results saved to: " -NoNewline
Write-Host $ResultsDir -ForegroundColor Yellow

Write-Host "`nGenerated files:"
Get-ChildItem $ResultsDir | Format-Table Name, Length, LastWriteTime

exit 0
