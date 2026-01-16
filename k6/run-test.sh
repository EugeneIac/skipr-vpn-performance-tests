#!/bin/bash
# K6 Test Runner for CI/CD
# Sends metrics directly to Prometheus (InfluxDB v2 compatible)

set -e

# Configuration
TEST_FILE="${1:-dist/e2e-simple.test.js}"
SCENARIO="${2:-smoke}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090/api/v1/write}"

echo "🚀 Running K6 Test"
echo "📄 Test file: $TEST_FILE"
echo "🎯 Scenario: $SCENARIO"
echo "📊 Prometheus URL: $PROMETHEUS_URL"

# Check if running in Docker
if [ -f /.dockerenv ]; then
    echo "🐳 Running inside Docker"
    K6_COMMAND="k6"
else
    echo "💻 Running on host - using Docker"
    K6_COMMAND="docker run --rm --network host -v $(pwd):/scripts grafana/k6:latest"
fi

# Run k6 with Prometheus remote write
$K6_COMMAND run \
    --insecure-skip-tls-verify \
    /scripts/$TEST_FILE \
    --out experimental-prometheus-rw \
    --tag testid=$(date +%Y%m%d-%H%M%S) \
    --tag scenario=$SCENARIO

echo "✅ Test completed"
echo "📈 Check metrics in Grafana: http://localhost:3000"
