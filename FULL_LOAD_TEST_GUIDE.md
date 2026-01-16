# 🚀 Full Load Testing - Quick Start

## Prerequisites

1. **k6 installed** (or use Docker version)
2. **Test environment available**: https://13.126.238.40
3. **Configuration set up**: `scripts/k6/env.json` (already configured)
4. **Monitoring running** (optional):
   ```powershell
   cd docker
   docker-compose up -d
   ```

## 🎯 Running Full Test

### Option 1: Docker (recommended) ⭐

Uses k6 in Docker - no local installation required:

```powershell
# From project root directory
.\run_full_load_test_docker.ps1
```

**Benefits**:
- ✅ No need to install k6 locally
- ✅ Same version on all machines
- ✅ Portable solution

### Option 2: Local k6

If k6 is already installed locally:

```powershell
# From project root directory
.\run_full_load_test.ps1
```

**Duration**: ~60-70 minutes  
**Results**: `results/full-test-YYYY-MM-DD_HH-mm-ss/`

### Option 3: Manual (step-by-step control)

If you want to execute phases manually with breaks:

```powershell
cd scripts/k6

# PHASE 1: Smoke Test (~2 minutes)
k6 run --insecure-skip-tls-verify dist/instant-servers.test.js

# PHASE 2: Single E2E (~2 minutes)
k6 run --insecure-skip-tls-verify dist/e2e-simple.test.js

# PHASE 3: Baseline - 10 VUs (~5 minutes)
k6 run --insecure-skip-tls-verify --vus 10 --duration 5m dist/e2e-simple.test.js

# PHASE 4: Load Test - up to 50 VUs (~15 minutes)
k6 run --insecure-skip-tls-verify `
  --stage 2m:10 --stage 3m:25 --stage 5m:50 --stage 3m:25 --stage 2m:0 `
  dist/e2e-simple.test.js

# PHASE 5: Stress Test - up to 150 VUs (~20 minutes)
k6 run --insecure-skip-tls-verify `
  --stage 3m:50 --stage 5m:100 --stage 5m:150 --stage 3m:100 --stage 2m:0 `
  dist/e2e-simple.test.js
```

## 📊 Testing Phases

| Phase | Goal | Load | Time | Expected Result |
|------|------|----------|-------|---------------------|
| **1. Smoke** | Check availability | Minimal | ~2 min | 100% checks passed |
| **2. Single E2E** | Full flow (1 user) | 1 VU | ~2 min | Successful provision |
| **3. Baseline** | Normal load | 10 VUs | 5 min | p95 < 2s, errors < 1% |
| **4. Load** | Increased load | up to 50 VUs | 15 min | p95 < 3s, errors < 2% |
| **5. Stress** | Find breaking point | up to 150 VUs | 20 min | Determine maximum |

**Total**: ~60-70 minutes

## 🔍 Monitoring During Testing

1. **Terminal**: Watch live metrics in k6 console
2. **Grafana**: http://localhost:3000 (admin/admin)
   - Dashboard: "k6 Load Testing"
   - Real-time metrics
3. **Prometheus**: http://localhost:9090

## 📈 After Testing

1. **Results**: Check `results/full-test-YYYY-MM-DD_HH-mm-ss/`
   - `phase1-smoke-test.json`
   - `phase2-single-e2e.json`
   - `phase3-baseline-test.json`
   - `phase4-load-test.json`
   - `phase5-stress-test.json`

2. **Analysis**: See [INTERPRETING_RESULTS.md](INTERPRETING_RESULTS.md)

3. **Key Metrics**:
   - http_req_duration (p95, p99)
   - http_req_failed rate
   - checks pass rate
   - iterations per second

## ⚠️ Troubleshooting

### Docker not installed (for Docker version)
```powershell
# Download and install Docker Desktop
# https://www.docker.com/products/docker-desktop
```

### k6 not installed (for local version)
```powershell
# Windows (winget)
winget install k6

# or Chocolatey
choco install k6

# or use Docker version (recommended)
.\run_full_load_test_docker.ps1
```

### Connection errors
- Check availability: `curl https://13.126.238.40`
- Make sure agent is running
- Check configuration in `scripts/k6/env.json`

### TypeScript build not found
```powershell
cd scripts/k6
npm install
npm run build
```

### High error rate (>5%)
- Normal for Phase 5 (Stress Test) at peak load
- Critical if error rate is high in Phase 3-4
- Check agent logs and capacity

## 🎓 Additional Information

- **Full strategy**: [vpn_performance_testing_strategy.md](vpn_performance_testing_strategy.md)
- **Test sequence**: [TEST_EXECUTION_SEQUENCE.md](TEST_EXECUTION_SEQUENCE.md)
- **Results analysis**: [INTERPRETING_RESULTS.md](INTERPRETING_RESULTS.md)
- **k6 integration**: [K6_INTEGRATION_SUMMARY.md](K6_INTEGRATION_SUMMARY.md)

## 💡 Pro Tips

1. **Run tests during off-hours** - minimizes impact from other users
2. **Monitor server metrics** - CPU, RAM, Network on agents
3. **Save baseline results** - for comparison after changes
4. **Check recovery** - system should recover after stress test
