# VPN Performance Testing Suite

> **🆕 Now with GitHub Actions support!** Run tests automatically with configurable parameters.

Comprehensive load and performance testing framework for Skipr Network VPN backend infrastructure.

## 🚀 Quick Start

### GitHub Actions (Recommended)

1. Go to **Actions** tab in GitHub
2. Select **Performance Tests** workflow
3. Click **Run workflow**
4. Choose parameters:
   - **Environment**: test, dev, staging, prod
   - **Max VUs**: 10-200
   - **Test Type**: smoke, baseline, load, stress, full
   - **Duration**: minutes
5. View results in artifacts

**CLI**:
```bash
gh workflow run performance-tests.yml -f test_type=smoke -f max_vus=50
```

📖 **Full guide**: [docs/QUICKSTART_CI.md](docs/QUICKSTART_CI.md)

### Local Testing

**PowerShell**:
```powershell
cd scripts
.\run_k6_tests.ps1 -Environment test -TestType smoke -MaxVUs 10
```

**Bash**:
```bash
cd scripts
TEST_ENV=test TEST_TYPE=smoke MAX_VUS=10 ./run_k6_tests.sh
```

**Docker** (original):
```powershell
.\run_full_load_test_docker.ps1
```

---

## 📁 Project Structure

```
performance_tests/
├── k6/                          # K6 TypeScript test framework
│   ├── tests/                   # Test scenarios
│   ├── requests/                # API request modules
│   ├── scenarios/               # Load profiles
│   ├── utils/                   # Helpers (Ed25519 signing, config)
│   ├── env.json                 # Environment configuration (test, dev, staging, prod)
│   └── package.json
├── scripts/                     # Test runner scripts
│   ├── run_k6_tests.sh         # CI/CD runner (Linux/GitHub Actions)
│   ├── run_k6_tests.ps1        # CI/CD runner (Windows/Local)
│   ├── vpn_api_load_test.js    # Simple k6 load test
│   └── instant_autoscaling_*.js # Autoscaling tests
├── docker/                      # Monitoring stack
│   ├── docker-compose.yml      # Grafana + Prometheus + InfluxDB
│   └── prometheus.yml
├── results/                     # Test results (JSON files)
├── docs/                        # 📚 Documentation
│   ├── QUICKSTART.md           # Quick start guide
│   ├── QUICKSTART_CI.md        # CI/CD quick start
│   ├── ALERTING_GUIDE.md       # Alert thresholds
│   ├── GRAFANA_SETUP.md        # Grafana configuration
│   └── *.md                    # Other documentation
└── README.md                    # This file
```

---

## 🎯 Test Types & Environments

### Test Types

| Type | VUs | Duration | Purpose |
|------|-----|----------|---------|
| **smoke** | 1 | 30s | Quick sanity check |
| **baseline** | 10* | 5m | Establish baseline |
| **load** | 50* | 10m | Realistic production load |
| **stress** | max* | 15m | Find breaking point |
| **full** | progressive | 45-60m | Complete pipeline |

*Scaled to max_vus parameter

### Environments

- **test**: `https://13.126.238.40` (default)
- **dev**: `https://dev-api.skipr.network`
- **staging**: `https://staging-api.skipr.network`
- **prod**: `https://api.skipr.network`

Configured in `k6/env.json`

---

## 🎯 Available Test Options

### Option 1: Docker k6 (Recommended - No local installation needed)
```powershell
.\run_full_load_test_docker.ps1
```

### Option 2: k6 TypeScript Framework
```powershell
cd k6
npm run build

# Run specific tests
k6 run --insecure-skip-tls-verify dist/instant-servers.test.js
k6 run --insecure-skip-tls-verify dist/e2e-simple.test.js
```

### Option 3: Simple JavaScript k6
```powershell
docker run --rm --network host `
  -v "${PWD}\scripts:/scripts" `
  grafana/k6:latest run /scripts/vpn_api_load_test.js
```

### Option 4: Locust (Python distributed testing)
```powershell
pip install -r requirements.txt
locust -f scripts/locust_vpn_test.py --host=https://api.skipr.network
```

## 📊 Test Scenarios

### Smoke Test
- **Purpose**: Check endpoints availability
- **Load**: Minimal (1 VU, 1 iteration)
- **Duration**: ~1 minute
- **Script**: `k6/tests/instant-servers.test.js`

### Single E2E Flow
- **Purpose**: Validate full user journey
- **Load**: 1 VU, 1 iteration
- **Duration**: ~1 minute
- **Script**: `k6/tests/e2e-simple.test.js`

### Baseline Test
- **Purpose**: Establish normal load metrics
- **Load**: 10 VUs for 5 minutes
- **Duration**: 5 minutes
- **Expected**: p95 < 2s, errors < 1%

### Load Test
- **Purpose**: Test increased but realistic load
- **Load**: Ramp 10 → 25 → 50 → 25 → 0 VUs
- **Duration**: 15 minutes
- **Expected**: p95 < 3s, errors < 2%

### Stress Test
- **Purpose**: Find breaking point
- **Load**: Ramp 50 → 100 → 150 → 100 → 0 VUs
- **Duration**: 20 minutes
- **Expected**: Identify max capacity

## 🔍 Key Metrics

### Success Criteria
- **checks pass rate** > 95%
- **http_req_duration p95** < 3s (normal load), < 5s (stress)
- **http_req_failed** < 2% (normal load), < 5% (stress)
- **System recovery** after load decrease

### Critical Metrics
- Request latency (avg, p90, p95, p99, max)
- Error rate (%)
- Throughput (requests/second)
- Active VUs
- Iteration duration

## 🎛️ Configuration

### k6 TypeScript Tests
Edit `k6/env.json`:
```json
{
  "environment": "test",
  "domains": {
    "test": {
      "host": "https://13.126.238.40",
      "api_port": 443,
      ...
    }
  }
}
```

### Prometheus
Edit `docker/prometheus.yml` for scrape intervals and targets.

### Grafana
Dashboards located in `docker/grafana/dashboards/`

## 🚨 Troubleshooting

### Tests fail immediately
- Check test environment availability
- Verify configuration in `k6/env.json`
- Ensure Docker is running

### No metrics in Grafana
- Check Prometheus is scraping: http://localhost:9090/targets
- Verify k6 is sending metrics (look for `output: Prometheus remote write`)
- Restart Prometheus: `cd docker && docker-compose restart prometheus`

### High error rates
- Check agent capacity
- Review agent logs
- Verify license activation service

### Docker volume mount issues (Windows)
- Use forward slashes in paths
- Ensure Docker has access to workspace folder

## 📈 Results Analysis

After tests complete:
1. Checkdocs/INTERPRETING_RESULTS.md](docs/INTERPRETING_RESULTS.md) for detailed analysis

## 📚 Documentation

- [Quick Start Guide](docs/QUICKSTART.md) - Get started in 10 minutes
- [CI/CD Guide](docs/QUICKSTART_CI.md) - GitHub Actions integration
- [Test Execution Sequence](docs/TEST_EXECUTION_SEQUENCE.md) - Test phases explained
- [Interpreting Results](docs/INTERPRETING_RESULTS.md) - Analyze test results
- [Alerting Guide](docs/ALERTING_GUIDE.md) - Alert thresholds and troubleshooting
- [Grafana Setup](docs/GRAFANA_SETUP.md) - Configure dashboards
- [K6 Integration](docs/K6_INTEGRATION_SUMMARY.md) - TypeScript framework detail
2. View Grafana dashboards: http://localhost:3000
3. Query Prometheus: http://localhost:9090
4. Review JSON files in `results/` directory
5. See [INTERPRETING_RESULTS.md](INTERPRETING_RESULTS.md) for detailed analysis

## 🔗 Related Projects

- **API E2E Tests**: `../api_e2e_tests/` - Functional E2E testing with WebSocket
- **Backend Services**: `../skipr-agent/`, `../skipr-captain/` - Services under test

## 🤝 Contributing

When adding new tests:
1. Follow existing test structure
2. Update documentation
3. Add to CI/CD pipeline if applicable
4. Document expected results and thresholds

## 📝 License

Internal use - Skipr Network
