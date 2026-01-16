# 🚀 Ready to Run Full Load Testing

## ✅ Readiness Status

- ✅ **Docker is running** (Grafana, Prometheus started)
- ✅ **k6 TypeScript project built** (dist/ exists)
- ✅ **Configuration set up** (scripts/k6/env.json for test environment)
- ✅ **Test environment**: https://13.126.238.40
- ✅ **Monitoring**: 
  - Grafana: http://localhost:3000
  - Prometheus: http://localhost:9090

## 🎯 Command to Run

```powershell
.\run_full_load_test_docker.ps1
```

**Duration**: ~60-70 minutes  
**Uses**: Docker version of k6 (no local installation required)

## 📊 What Will Be Tested

| # | Phase | Load | Time | Goal |
|---|------|----------|-------|------|
| 1 | Smoke Test | Minimal | 2 min | Check availability |
| 2 | Single E2E | 1 VU | 2 min | Check full flow |
| 3 | Baseline | 10 VUs | 5 min | Normal load |
| 4 | Load Test | up to 50 VUs | 15 min | Increased load |
| 5 | Stress Test | up to 150 VUs | 20 min | Find breaking point |

## 📈 Monitoring During Test

1. **Terminal**: Live k6 metrics
2. **Grafana**: http://localhost:3000 (admin/admin)
3. **Prometheus**: http://localhost:9090

## 📁 Results

Will be saved in: `results/full-test-YYYY-MM-DD_HH-mm-ss/`

- phase1-smoke-test.json
- phase2-single-e2e.json
- phase3-baseline-test.json
- phase4-load-test.json
- phase5-stress-test.json

## 🔍 After Testing

See: [INTERPRETING_RESULTS.md](INTERPRETING_RESULTS.md)

---

**Run now?**
```powershell
.\run_full_load_test_docker.ps1
```
