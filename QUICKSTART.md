# 🚀 Quick Start Guide - VPN Performance Testing

This guide will help you run your first tests in 10 minutes.

**📋 Correct test execution sequence**: [TEST_EXECUTION_SEQUENCE.md](TEST_EXECUTION_SEQUENCE.md)

## Prerequisites

Make sure you have installed:
- ✅ Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- ✅ Docker Compose
- ✅ Git Bash (for Windows) or any bash terminal

## Step 1: Configuration Setup (2 minutes)

```bash
# 1. Navigate to project directory
cd D:/Work/Skipr/performance_testing

# 2. Create .env file from example
cp .env.example .env

# 3. Edit .env - you need to specify BASE_URL at minimum
# Open in any editor and change:
# BASE_URL=https://your-actual-api.skipr.network
```

**Important:** Replace `https://api.skipr.network` with the actual URL of your backend API.

## Step 2: Start Monitoring (3 minutes)

```bash
# Navigate to docker directory
cd docker

# Start monitoring stack
docker-compose up -d prometheus grafana node-exporter

# Check status (all should be "Up")
docker-compose ps

# Output should look like this:
#        Name                      Command               State           Ports
# ---------------------------------------------------------------------------------
# vpn-grafana         /run.sh                          Up      0.0.0.0:3000->3000/tcp
# vpn-prometheus      /bin/prometheus --config.f ...   Up      0.0.0.0:9090->9090/tcp
# vpn-node-exporter   /bin/node_exporter --path. ...   Up      0.0.0.0:9100->9100/tcp
```

Open in browser:
- **Grafana**: http://localhost:3000 (login: `admin`, password: `admin`)
- **Prometheus**: http://localhost:9090

## Step 3: First Test - Baseline (5 minutes)

### Option A: Via Docker (recommended, works everywhere)

```bash
# From project root directory
cd D:/Work/Skipr/performance_testing

# Run baseline test with 50 users for 5 minutes
docker run --rm \
  --network host \
  -v "$(pwd)/scripts:/scripts" \
  -v "$(pwd)/results:/results" \
  -e BASE_URL="https://api.skipr.network" \
  -e TARGET_VUS=50 \
  -e TEST_DURATION=5m \
  grafana/k6:latest \
  run /scripts/vpn_api_load_test.js
```

### Option B: If you have k6 installed locally

```bash
cd scripts

# Run with environment parameters
BASE_URL=https://api.skipr.network \
TARGET_VUS=50 \
TEST_DURATION=5m \
k6 run vpn_api_load_test.js
```

## What You'll See During the Test

```
          /\      |‾‾| /‾‾/   /‾‾/
     /\  /  \     |  |/  /   /  /
    /  \/    \    |     (   /   ‾‾\
   /          \   |  |\  \ |  (‾)  |
  / __________ \  |__| \__\ \_____/ .io

  execution: local
     script: vpn_api_load_test.js
     output: -

  scenarios: (100.00%) 1 scenario, 50 max VUs, 10m30s max duration

  ✓ auth successful
  ✓ servers list retrieved
  ✓ config received
  ✓ connection initiated

  █ VPN Connection Time...: avg=1.2s min=890ms max=2.1s p(95)=1.8s
  █ Auth: Login............: avg=345ms min=200ms max=680ms p(95)=520ms

  http_reqs..................: 1250   ~25/s
  http_req_duration..........: avg=456ms min=120ms max=2.3s p(95)=1.2s
  vpn_connection_attempts....: 250
  vpn_connection_successes...: 248 (99.2%)
```

## Results Analysis

After test completion:

```bash
# Results are saved in:
ls -la results/

# Open HTML report
# Windows
start results/summary.html

# Mac
open results/summary.html

# Linux
xdg-open results/summary.html
```

### Key Metrics for Analysis:

1. **Connection Success Rate**: Should be >99%
   - ✅ Good: 99%+
   - ⚠️ Warning: 95-99%
   - ❌ Bad: <95%

2. **Average Connection Time**: Should be <3 seconds
   - ✅ Excellent: <1s
   - ✅ Good: 1-2s
   - ⚠️ Acceptable: 2-3s
   - ❌ Bad: >3s

3. **HTTP Request Duration (p95)**: Should be <2 seconds
   - ✅ Excellent: <500ms
   - ✅ Good: 500ms-1s
   - ⚠️ Acceptable: 1-2s
   - ❌ Bad: >2s

4. **Error Rate**: Should be <1%
   - ✅ Excellent: 0%
   - ✅ Good: <0.1%
   - ⚠️ Acceptable: 0.1-1%
   - ❌ Bad: >1%

## Real-time Monitoring

During the test, open Grafana:

```bash
# 1. Open http://localhost:3000
# 2. Login: admin / admin
# 3. Navigate to Dashboards
# 4. Import dashboard from:
#    monitoring/grafana/dashboards/vpn-performance.json
```

You'll see in real-time:
- Number of active connections
- CPU and Memory usage
- Network throughput
- Error rates
- Response times

## Next Steps

### 1. TypeScript K6 Tests (Recommended)

New structured architecture for performance tests:

```bash
# Navigate to k6 directory
cd scripts/k6

# Install dependencies
npm install

# Configure settings
cp env.example.json env.json
# Edit env.json with your data

# Compile TypeScript
npm run build

# Run tests
k6 run --insecure-skip-tls-verify dist/instant-servers.test.js
k6 run --insecure-skip-tls-verify dist/e2e-simple.test.js

# Load test with 50 VUs
k6 run --insecure-skip-tls-verify dist/e2e-simple.test.js --vus 50 --duration 5m
```

**TypeScript k6 Advantages:**
- ✅ Structured architecture (Request classes, Scenarios)
- ✅ Ed25519 authentication out of the box
- ✅ Ready scenarios: debug, load, stress, performance, spike
- ✅ Type-safe code with IntelliSense

See details: [scripts/k6/README.md](scripts/k6/README.md)

### 2. Increase Load (Load Test)

```bash
docker run --rm \
  --network host \
  -v "$(pwd)/scripts:/scripts" \
  -v "$(pwd)/results:/results" \
  -e BASE_URL="https://api.skipr.network" \
  -e TARGET_VUS=200 \
  -e TEST_DURATION=15m \
  grafana/k6:latest \
  run /scripts/vpn_api_load_test.js
```

### 3. Stress Test - find breaking point

```bash
docker run --rm \
  --network host \
  -v "$(pwd)/scripts:/scripts" \
  -v "$(pwd)/results:/results" \
  -e BASE_URL="https://api.skipr.network" \
  -e TARGET_VUS=500 \
  -e TEST_DURATION=15m \
  grafana/k6:latest \
  run /scripts/vpn_api_load_test.js
```

### 4. Full automatic run of all phases

```bash
cd scripts
chmod +x run_tests.sh
./run_tests.sh
```

### 5. Alternative - Locust (Python)

```bash
# Installation
pip install -r requirements.txt

# Run
cd scripts
locust -f locust_vpn_test.py --host=https://api.skipr.network

# Open Web UI: http://localhost:8089
# Specify number of users and spawn rate
```

### 6. Testing real VPN connections

```bash
cd docker

# Run 50 VPN clients
docker-compose --profile clients up -d --scale vpn-client=50

# Monitoring
watch -n 5 'docker ps --filter "name=vpn-client" | grep healthy | wc -l'

# Logs
docker-compose logs -f vpn-client

# Stop
docker-compose --profile clients down
```

## Troubleshooting

### Issue: Docker cannot connect to API

```bash
# Check API availability
curl -I https://api.skipr.network/health

# If not working, check BASE_URL in .env
```

### Issue: k6 tests fail with error

```bash
# Check more detailed output
docker run --rm \
  --network host \
  -v "$(pwd)/scripts:/scripts" \
  -e BASE_URL="https://api.skipr.network" \
  grafana/k6:latest \
  run --verbose /scripts/vpn_api_load_test.js
```

### Issue: Grafana doesn't show data

```bash
# 1. Check that Prometheus is collecting metrics
# Open http://localhost:9090/targets
# All targets should be "UP"

# 2. Restart monitoring
cd docker
docker-compose restart prometheus grafana
```

### Issue: "Too many open files"

```bash
# Increase limits (Linux/Mac)
ulimit -n 65535

# For Windows - restart Docker Desktop
```

## Stopping and Cleanup

```bash
# Stop monitoring
cd docker
docker-compose down

# Full cleanup (including volumes)
docker-compose down -v

# Cleanup old results (older than 30 days)
find results/ -type d -mtime +30 -exec rm -rf {} +
```

## Useful Commands

```bash
# Check status of all containers
docker ps -a

# Resource usage by containers
docker stats

# Logs of specific service
docker logs -f vpn-prometheus

# Docker cleanup
docker system prune -a
```

## Pre-Testing Checklist

- [ ] Docker is running
- [ ] .env file configured with correct BASE_URL
- [ ] API backend is available and working
- [ ] Monitoring is running (Grafana + Prometheus)
- [ ] Enough disk space for logs and results
- [ ] Firewall doesn't block connections
- [ ] Test users exist in the system (or created automatically)

## Support

If you encounter issues:

1. Check logs: `docker-compose logs -f`
2. Check README.md for detailed documentation
3. Check vpn_performance_testing_strategy.md for theoretical basics

---

**Done!** 🎉

Now you can run performance tests and identify bottlenecks in your VPN backend.

Next step: run Stress Test and find the system's breaking point.
