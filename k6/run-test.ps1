# K6 Test Runner for CI/CD (PowerShell)
# Sends metrics directly to Prometheus (InfluxDB v2 compatible)

param(
    [Parameter(Mandatory=$false)]
    [string]$TestFile = "dist/e2e-simple.test.js",
    
    [Parameter(Mandatory=$false)]
    [string]$Scenario = "smoke",
    
    [Parameter(Mandatory=$false)]
    [string]$PrometheusUrl = "http://localhost:9090/api/v1/write"
)

$ErrorActionPreference = "Stop"

Write-Host "[RUN] Running K6 Test" -ForegroundColor Green
Write-Host "[FILE] Test file: $TestFile" -ForegroundColor Cyan
Write-Host "[SCENARIO] Scenario: $Scenario" -ForegroundColor Cyan
Write-Host "[TARGET] Prometheus URL: $PrometheusUrl" -ForegroundColor Cyan

# Generate test ID with timestamp
$TestId = Get-Date -Format "yyyyMMdd-HHmmss"

# Check if k6 is installed locally
$k6Installed = Get-Command k6 -ErrorAction SilentlyContinue

if ($k6Installed) {
    Write-Host "[LOCAL] Using local k6 installation" -ForegroundColor Yellow
    
    $env:K6_PROMETHEUS_RW_SERVER_URL = $PrometheusUrl
    $env:K6_PROMETHEUS_RW_PUSH_INTERVAL = "1s"
    $env:K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM = "false"
    
    k6 run --insecure-skip-tls-verify $TestFile `
        --out experimental-prometheus-rw `
        --tag testid=$TestId `
        --tag scenario=$Scenario
} else {
    Write-Host "[DOCKER] Using Docker k6 image" -ForegroundColor Yellow
    
    docker run --rm --network host `
        -v "${PWD}:/scripts" `
        -e K6_PROMETHEUS_RW_SERVER_URL="$PrometheusUrl" `
        -e K6_PROMETHEUS_RW_PUSH_INTERVAL="1s" `
        -e K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM="false" `
        grafana/k6:latest run --insecure-skip-tls-verify /scripts/$TestFile `
        --out experimental-prometheus-rw `
        --tag testid=$TestId `
        --tag scenario=$Scenario
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "[SUCCESS] Test completed successfully!" -ForegroundColor Green
    Write-Host "[GRAFANA] Check metrics in Grafana: http://localhost:3000" -ForegroundColor Cyan
} else {
    Write-Host "[FAILED] Test failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}
