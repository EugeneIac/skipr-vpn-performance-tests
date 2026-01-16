# Makefile for VPN Performance Testing

.PHONY: help install build start stop test clean

# Default target
help:
	@echo "🚀 VPN Performance Testing - Available Commands:"
	@echo ""
	@echo "  make install     - Install all dependencies"
	@echo "  make build       - Build k6 test bundles"
	@echo "  make start       - Start monitoring stack (Grafana, Prometheus, InfluxDB)"
	@echo "  make stop        - Stop monitoring stack"
	@echo "  make test-smoke  - Run smoke test"
	@echo "  make test-load   - Run load test"
	@echo "  make test-stress - Run stress test"
	@echo "  make test-all    - Run all tests sequentially"
	@echo "  make clean       - Clean build artifacts and volumes"
	@echo "  make logs        - Show monitoring stack logs"
	@echo ""
	@echo "📊 Grafana: http://localhost:3000 (admin/admin)"
	@echo "📈 Prometheus: http://localhost:9090"
	@echo "💾 InfluxDB: http://localhost:8086"

# Install dependencies
install:
	@echo "📦 Installing dependencies..."
	cd scripts/k6 && npm install
	@echo "✅ Dependencies installed"

# Build k6 tests
build:
	@echo "🔨 Building k6 test bundles..."
	cd scripts/k6 && npm run build
	@echo "✅ Build completed"

# Start monitoring stack
start:
	@echo "🚀 Starting monitoring stack..."
	cd docker && docker-compose -f docker-compose.monitoring.yml up -d
	@echo "⏳ Waiting for services to be ready..."
	@sleep 10
	@echo "✅ Monitoring stack is ready!"
	@echo "📊 Grafana: http://localhost:3000 (admin/admin)"
	@echo "📈 Prometheus: http://localhost:9090"

# Stop monitoring stack
stop:
	@echo "🛑 Stopping monitoring stack..."
	cd docker && docker-compose -f docker-compose.monitoring.yml down
	@echo "✅ Monitoring stack stopped"

# Run smoke test
test-smoke: build
	@echo "🧪 Running smoke test..."
	cd scripts/k6 && bash run-test.sh dist/e2e-simple.test.js smoke

# Run load test
test-load: build
	@echo "📈 Running load test..."
	cd scripts/k6 && bash run-test.sh dist/e2e-simple.test.js load

# Run stress test
test-stress: build
	@echo "💪 Running stress test..."
	cd scripts/k6 && bash run-test.sh dist/e2e-simple.test.js stress

# Run all tests
test-all: test-smoke test-load test-stress
	@echo "✅ All tests completed!"

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	cd scripts/k6 && rm -rf dist/ node_modules/ results.json
	cd docker && docker-compose -f docker-compose.monitoring.yml down -v
	@echo "✅ Cleanup completed"

# Show logs
logs:
	@echo "📋 Showing monitoring stack logs..."
	cd docker && docker-compose -f docker-compose.monitoring.yml logs -f

# Quick start (install + build + start)
quickstart: install build start
	@echo "🎉 Quick start completed!"
	@echo "📊 Open Grafana: http://localhost:3000"
	@echo "🧪 Run test: make test-smoke"
