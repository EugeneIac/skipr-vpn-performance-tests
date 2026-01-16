# Performance Tests - Quick Start Guide (CI/CD Ready)

> **New**: Tests can now run in GitHub Actions with configurable parameters!

---

## 🚀 Run in GitHub Actions (Recommended)

### Quick Start

1. Go to GitHub **Actions** tab
2. Select **Performance Tests** workflow
3. Click **Run workflow**
4. Select parameters and run

### Parameters

| Parameter | Options | Default | Description |
|-----------|---------|---------|-------------|
| Environment | test, dev, staging, prod | `test` | Target environment |
| Max VUs | 10, 25, 50, 100, 150, 200 | `50` | Maximum virtual users |
| Test Type | smoke, baseline, load, stress, full | `full` | Type of test |
| Duration | Any number | `5` | Duration in minutes |

### Test Types

- **smoke** (30s) - Quick check that endpoints work
- **baseline** (5m) - Normal load with 10 VUs
- **load** (10m) - Realistic load with 50 VUs
- **stress** (15m) - Maximum load to find limits
- **full** (45-60m) - All phases in sequence

### GitHub CLI

```bash
# Smoke test
gh workflow run performance-tests.yml -f test_type=smoke -f max_vus=10

# Load test
gh workflow run performance-tests.yml -f test_type=load -f max_vus=100 -f duration=10

# Full suite
gh workflow run performance-tests.yml -f test_type=full -f max_vus=50
```

---

## 💻 Run Locally

### Option 1: PowerShell Script (Windows)

```powershell
cd performance_tests/scripts

# Smoke test
.\run_k6_tests.ps1 -Environment test -TestType smoke -MaxVUs 10

# Full suite
.\run_k6_tests.ps1 -Environment test -TestType full -MaxVUs 50

# Custom load test
.\run_k6_tests.ps1 -Environment staging -TestType load -MaxVUs 100 -Duration 15
```

### Option 2: Bash Script (Linux/macOS)

```bash
cd performance_tests/scripts

# Set variables
export TEST_ENV=test
export MAX_VUS=50
export TEST_TYPE=full
./run_k6_tests.sh

# Or one-liner
TEST_ENV=test MAX_VUS=50 TEST_TYPE=load ./run_k6_tests.sh
```

### Option 3: Original Docker Script

```powershell
cd performance_tests
.\run_full_load_test_docker.ps1
```

---

## 📊 View Results

### GitHub Actions

- **Summary**: View in workflow run page
- **Artifacts**: Download from run page (retained 30 days)
- **Logs**: Check job output for detailed metrics

### Local Testing

- **Results Directory**: `performance_tests/results/{test-type}-{env}-{timestamp}/`
- **JSON Files**: One per test phase
- **Console**: Real-time metrics during test

---

## 🎯 Examples

### Development Testing

```bash
# Quick smoke test on dev
gh workflow run performance-tests.yml \
  -f environment=dev \
  -f test_type=smoke \
  -f max_vus=10

# Baseline performance on dev
gh workflow run performance-tests.yml \
  -f environment=dev \
  -f test_type=baseline \
  -f max_vus=10 \
  -f duration=5
```

### Staging Validation

```bash
# Load test before production deployment
gh workflow run performance-tests.yml \
  -f environment=staging \
  -f test_type=load \
  -f max_vus=100 \
  -f duration=15

# Full regression suite
gh workflow run performance-tests.yml \
  -f environment=staging \
  -f test_type=full \
  -f max_vus=50
```

### Production Monitoring

```bash
# Periodic stress test (off-peak hours)
gh workflow run performance-tests.yml \
  -f environment=prod \
  -f test_type=stress \
  -f max_vus=200 \
  -f duration=20
```

---

## 🔧 Configuration

### Environments

Configured in `performance_tests/k6/env.json`:

- **test**: `https://13.126.238.40`
- **dev**: `https://dev-api.skipr.network`
- **staging**: `https://staging-api.skipr.network`
- **prod**: `https://api.skipr.network`

### VU Scaling

Tests automatically scale based on `max_vus`:

```
baseline: min(10, max_vus)
load:     min(50, max_vus)
stress:   max_vus
```

### Full Suite Phases

```
Phase 1: Smoke (1 VU, 30s)        - Always
Phase 2: Single E2E (1 VU, 1m)    - Always
Phase 3: Baseline (10 VUs, 5m)    - Always
Phase 4: Load (50 VUs, 10m)       - If max_vus >= 25
Phase 5: Stress (max_vus, 15m)    - If max_vus >= 50
```

---

## ✅ Success Thresholds

- **Error Rate**: < 5%
- **P95 Latency**: < 10 seconds
- **Check Pass Rate**: > 95%

---

## 📚 Documentation

- [GITHUB_ACTIONS_SETUP.md](../GITHUB_ACTIONS_SETUP.md) - GitHub Actions detailed guide
- [.github/workflows/README.md](../.github/workflows/README.md) - Workflow documentation
- [README.md](README.md) - Complete performance testing guide
- [QUICKSTART.md](QUICKSTART.md) - Original quickstart guide

---

## 🚨 Need Help?

### Common Issues

**Tests don't start in GitHub Actions**
- Check workflow syntax
- Verify Docker availability
- Review build step logs

**High error rates**
- Verify environment health
- Check if max_vus is appropriate
- Review configuration in env.json

**Local script errors**
- Ensure Docker is running
- Check k6 build completed: `cd k6 && npm run build`
- Verify paths are correct

---

**Quick Commands**:

```bash
# GitHub Actions (fastest way)
gh workflow run performance-tests.yml -f test_type=smoke

# Local PowerShell
.\scripts\run_k6_tests.ps1 -TestType smoke

# Local Bash
TEST_TYPE=smoke ./scripts/run_k6_tests.sh
```

**Ready to test!** 🎉
