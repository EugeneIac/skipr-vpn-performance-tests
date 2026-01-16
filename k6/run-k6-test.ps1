# K6 Test Runner with InfluxDB v2 output
# Usage: .\run-k6-test.ps1 <test-file>

param(
    [Parameter(Mandatory=$false)]
    [string]$TestFile = "dist/instant-servers.test.js",
    
    [Parameter(Mandatory=$false)]
    [string]$Scenario = "debug"
)

Write-Host "🚀 Running K6 test: $TestFile" -ForegroundColor Green
Write-Host "📊 Metrics will be saved to: results/k6-metrics.json" -ForegroundColor Cyan

# Create results directory if not exists
New-Item -ItemType Directory -Force -Path "results" | Out-Null

# Run k6 with JSON output (InfluxDB v2 compatibility issue)
docker run --rm --network host `
  -v "${PWD}:/scripts" `
  grafana/k6:latest run --insecure-skip-tls-verify /scripts/$TestFile `
  --out json=/scripts/results/k6-metrics.json

# Check exit code
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Test completed successfully!" -ForegroundColor Green
    Write-Host "📁 Results saved to: results/k6-metrics.json" -ForegroundColor Cyan
} else {
    Write-Host "❌ Test failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    Write-Host "💡 Check the logs above for details" -ForegroundColor Yellow
}

# Show summary if results file exists
if (Test-Path "results/k6-metrics.json") {
    $fileSize = (Get-Item "results/k6-metrics.json").Length / 1KB
    Write-Host "📊 Results file size: $($fileSize.ToString('0.00')) KB" -ForegroundColor Cyan
}
