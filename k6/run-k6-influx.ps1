# K6 Test Runner with Prometheus Remote Write (InfluxDB v2 compatible)
# Usage: .\run-k6-influx.ps1 <test-file>

param(
    [Parameter(Mandatory=$false)]
    [string]$TestFile = "dist/instant-servers.test.js"
)

Write-Host "🚀 Running K6 test: $TestFile" -ForegroundColor Green
Write-Host "📊 Metrics will be sent to InfluxDB via Prometheus endpoint" -ForegroundColor Cyan

# InfluxDB v2 settings
$INFLUX_URL = "http://localhost:8086"
$INFLUX_ORG = "skipr"
$INFLUX_BUCKET = "k6"
$INFLUX_TOKEN = "skipr-token-change-me"

# Build Prometheus Remote Write URL for InfluxDB v2
$PROM_URL = "$INFLUX_URL/api/v2/write?org=$INFLUX_ORG&bucket=$INFLUX_BUCKET&precision=ms"

Write-Host "🔗 Target: $PROM_URL" -ForegroundColor Gray

# Run k6 with experimental-prometheus-rw output
docker run --rm --network host `
  -v "${PWD}:/scripts" `
  -e K6_PROMETHEUS_RW_SERVER_URL="$PROM_URL" `
  -e K6_PROMETHEUS_RW_PUSH_INTERVAL="1s" `
  -e K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM="false" `
  -e K6_PROMETHEUS_RW_INSECURE_SKIP_TLS_VERIFY="true" `
  grafana/k6:latest run --insecure-skip-tls-verify /scripts/$TestFile `
  --out experimental-prometheus-rw

# Check exit code
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Test completed successfully!" -ForegroundColor Green
    Write-Host "📈 Metrics sent to InfluxDB - check Grafana dashboard!" -ForegroundColor Cyan
    Write-Host "🌐 Grafana: http://localhost:3000" -ForegroundColor Cyan
} else {
    Write-Host "❌ Test failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    Write-Host "💡 Check the logs above for details" -ForegroundColor Yellow
}
