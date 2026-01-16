# Monitoring Live Tests - Quick Reference

## How to Monitor Running Tests

### 1. Terminal Output (Real-time)
The terminal running `run_full_load_test_docker.ps1` shows:
- Current phase (1-5)
- Test progress
- Live k6 metrics every ~10 seconds
- Pass/fail status

**Key metrics in terminal:**
```
✓ checks.........................: 95.00% 
✓ http_req_duration..............: avg=854ms  p(95)=1.2s
✓ http_req_failed................: 1.5%
```

### 2. Grafana Dashboard (Visual)
Open: http://localhost:3000 (admin/admin)

Navigate to: **Dashboards → k6 Load Testing**

**Real-time graphs:**
- HTTP request duration (p95, p99)
- Request rate (RPS)
- Error rate
- Active VUs
- Check pass rate

### 3. Prometheus Queries (Advanced)
Open: http://localhost:9090

Example queries:
```
k6_http_req_duration
k6_http_reqs
k6_vus
```

## Where to Find Results After Tests Complete

### JSON Result Files
Location: `results/full-test-YYYY-MM-DD_HH-mm-ss/`

Files:
- `phase1-smoke-test.json` - Smoke test raw data
- `phase2-single-e2e.json` - Single user E2E
- `phase3-baseline-test.json` - 10 VUs baseline
- `phase4-load-test.json` - Load test up to 50 VUs
- `phase5-stress-test.json` - Stress test up to 150 VUs

### Terminal Summary
At the end of each phase, you'll see:
```
PHASE 3 PASSED!
  checks.........................: 95.00% 
  http_req_duration..............: avg=854ms  p(95)=1.2s
  http_req_failed................: 1.5%
  http_reqs......................: 1234
```

### Grafana Historical View
After tests complete:
1. Go to http://localhost:3000
2. Select time range covering your test period
3. View all phases on one dashboard

## Key Metrics to Watch

### During Tests:
- **checks pass rate** > 90% (Phase 1-4), > 80% (Phase 5)
- **http_req_duration p95** < 3s (Phase 1-4), < 5s (Phase 5)
- **http_req_failed** < 2% (Phase 1-4), < 10% (Phase 5)

### Red Flags:
- Error rate > 10% in Phase 1-3
- p95 duration increasing linearly with VUs
- System not recovering after load decreases

## Quick Commands

### Check test status:
```powershell
# See if Docker containers are running
docker ps | Select-String "k6"

# Check latest results folder
Get-ChildItem results | Sort-Object LastWriteTime -Descending | Select-Object -First 1
```

### Stop tests if needed:
```powershell
# Ctrl+C in terminal running the script
# Or find and stop Docker container:
docker ps
docker stop <container_id>
```

### View results:
```powershell
# Navigate to results
cd results\full-test-YYYY-MM-DD_HH-mm-ss

# List result files
ls *.json
```

## Analysis After Completion

See [INTERPRETING_RESULTS.md](INTERPRETING_RESULTS.md) for detailed analysis guide.

**Quick analysis:**
1. Compare p95 latency across phases
2. Check error rates at different load levels
3. Identify breaking point (when errors spike)
4. Verify system recovery in ramp-down stages
