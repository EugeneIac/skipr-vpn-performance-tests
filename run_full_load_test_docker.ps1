# Full Load Testing Script - Docker Version
# ==========================================

$ErrorActionPreference = "Continue"
$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$ResultsDir = "results\full-test-$Timestamp"
$K6Image = "grafana/k6:latest"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Full Load Testing (Docker)" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Create results directory
New-Item -ItemType Directory -Force -Path $ResultsDir | Out-Null
Write-Host "Results folder: $ResultsDir`n" -ForegroundColor Green

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

# Get project root
$ProjectRoot = (Get-Location).Path
Write-Host "Project: $ProjectRoot`n" -ForegroundColor Gray

# Check k6 build
Write-Host "Checking TypeScript build..." -ForegroundColor Yellow
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

# Function to run k6 tests in Docker
function Run-K6Test {
    param(
        [string]$TestFile,
        [string]$OutputFile,
        [string[]]$K6Args = @()
    )
    
    $ScriptsMount = "${ProjectRoot}\k6:/k6"
    $ResultsMount = "${ProjectRoot}\results:/results"
    $OutputPath = "/results/$OutputFile"
    $TestPath = "/k6/dist/$TestFile"
    
    # Build complete argument list for docker
    $allArgs = @(
        "run", "--rm", "--network", "host",
        "-v", $ScriptsMount,
        "-v", $ResultsMount,
        "-e", "K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write",
        $K6Image,
        "run",
        "--insecure-skip-tls-verify",
        "--out", "json=$OutputPath",
        "--out", "experimental-prometheus-rw"
    ) + $K6Args + @($TestPath)
    
    & docker $allArgs
    return $LASTEXITCODE
}

# PHASE 1: SMOKE TEST
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "PHASE 1: SMOKE TEST" -ForegroundColor Cyan
Write-Host "Checking endpoints availability" -ForegroundColor Gray
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Running instant-servers.test.js..." -ForegroundColor Yellow
Run-K6Test -TestFile "instant-servers.test.js" -OutputFile "full-test-$Timestamp\phase1-smoke-test.json"

Write-Host "`nPHASE 1 COMPLETED!" -ForegroundColor Green
Write-Host "(Check results in $ResultsDir\phase1-smoke-test.json)" -ForegroundColor Gray
Write-Host "Waiting 30 seconds...`n" -ForegroundColor Gray
Start-Sleep -Seconds 30

# PHASE 2: SINGLE E2E FLOW
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "PHASE 2: SINGLE E2E FLOW" -ForegroundColor Cyan
Write-Host "Testing full flow with 1 user" -ForegroundColor Gray
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Running e2e-simple.test.js (debug mode)..." -ForegroundColor Yellow
Run-K6Test -TestFile "e2e-simple.test.js" -OutputFile "full-test-$Timestamp\phase2-single-e2e.json"

Write-Host "`nPHASE 2 COMPLETED!" -ForegroundColor Green
Write-Host "Waiting 30 seconds...`n" -ForegroundColor Gray
Start-Sleep -Seconds 30

# PHASE 3: BASELINE TEST
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "PHASE 3: BASELINE TEST" -ForegroundColor Cyan
Write-Host "10 VUs, 5 minutes - normal load" -ForegroundColor Gray
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Running baseline test..." -ForegroundColor Yellow
Run-K6Test -TestFile "e2e-simple.test.js" -OutputFile "full-test-$Timestamp\phase3-baseline-test.json" -K6Args @("--vus", "10", "--duration", "5m")

Write-Host "`nPHASE 3 COMPLETED!" -ForegroundColor Green
Write-Host "Waiting 60 seconds before load test...`n" -ForegroundColor Gray
Start-Sleep -Seconds 60

# PHASE 4: LOAD TEST
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "PHASE 4: LOAD TEST" -ForegroundColor Cyan
Write-Host "Ramp up to 50 VUs" -ForegroundColor Gray
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Running load test (this will take ~15 minutes)..." -ForegroundColor Yellow
Run-K6Test -TestFile "e2e-simple.test.js" -OutputFile "full-test-$Timestamp\phase4-load-test.json" -K6Args @("--stage", "2m:10", "--stage", "3m:25", "--stage", "5m:50", "--stage", "3m:25", "--stage", "2m:0")

Write-Host "`nPHASE 4 COMPLETED!" -ForegroundColor Green
Write-Host "Waiting 120 seconds before stress test...`n" -ForegroundColor Gray
Start-Sleep -Seconds 120

# PHASE 5: STRESS TEST
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "PHASE 5: STRESS TEST" -ForegroundColor Cyan
Write-Host "Ramp up to 150 VUs - finding breaking point" -ForegroundColor Gray
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Running stress test (this will take ~20 minutes)..." -ForegroundColor Yellow
Run-K6Test -TestFile "e2e-simple.test.js" -OutputFile "full-test-$Timestamp\phase5-stress-test.json" -K6Args @("--stage", "3m:50", "--stage", "5m:100", "--stage", "5m:150", "--stage", "3m:100", "--stage", "2m:0")

Write-Host "`nPHASE 5 COMPLETED!" -ForegroundColor Green

# COMPLETION
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TESTING COMPLETED!" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Results saved to:" -ForegroundColor Green
Write-Host "  $ResultsDir`n" -ForegroundColor White

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Analyze results in Grafana (http://localhost:3000)" -ForegroundColor Gray
Write-Host "  2. Compare metrics between phases" -ForegroundColor Gray
Write-Host "  3. Check logs for errors and bottlenecks" -ForegroundColor Gray
Write-Host "  4. See INTERPRETING_RESULTS.md for detailed analysis`n" -ForegroundColor Gray

Write-Host "Done!`n" -ForegroundColor Green
