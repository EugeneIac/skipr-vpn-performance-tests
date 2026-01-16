# K6 Performance Testing Alerts - What to Consider Abnormal

## Critical Alerts (severity: critical)

### 1. HTTP Success Rate < 95%
**Problem**: API returns errors (4xx/5xx)
**Abnormal when**:
- More than 5% of requests fail
- Agent is unavailable (connection refused)
- Backend is overloaded (503 Service Unavailable)
- Database is unavailable

**Actions**:
- Check backend logs: `docker logs skipr-agent`
- Check agent status: `curl https://agent-ip:443/status`
- Check Redis/PostgreSQL connections

---

## Warning Alerts (severity: warning)

### 2. Response Time p99 > 3000ms
**Problem**: API responds slowly
**Abnormal when**:
- License activation > 2s (should be ~500ms)
- Provision request > 3s (should be ~200ms)
- Network latency to AWS S3 > 1s

**Possible causes**:
- Backend is overloaded (CPU/Memory)
- Slow database queries
- Network latency to AWS
- Terraform provision queue is full

**Actions**:
- Check CPU/Memory: `docker stats`
- Check Redis queue: `redis-cli llen bull:provision:wait`
- Check Terraform logs

### 3. K6 Checks Pass Rate < 70%
**Problem**: Test checks are failing
**Abnormal when**:
- License activation doesn't create database record
- Provision request doesn't return provision_id
- JSON response doesn't contain expected fields

**What is checked in tests**:
- `response.status === 200/201`
- `response.json().provision_id !== undefined`
- `response.json().status === 'processing'`
- License activation is async (may be <100%)

**Actions**:
- View failed checks: `k6 run --summary-export=summary.json`
- Check API response schema
- Check Ed25519 signature validation

### 4. No K6 Tests for 10 minutes
**Problem**: CI/CD pipeline is broken
**Abnormal when**:
- GitHub Actions aren't running
- K6 Docker image is unavailable
- Prometheus doesn't receive metrics

**Actions**:
- Check GitHub Actions: `.github/workflows/performance-tests.yml`
- Check Prometheus targets: http://localhost:9090/targets
- Check k6 experimental-prometheus-rw output

---

## Base Thresholds for VPN Backend

### Normal Behavior (Production):
```
Success Rate: > 99%
Response Time p95: < 1000ms
Response Time p99: < 2000ms
Checks Pass Rate: > 95%
Request Rate: 10-100 req/sec
Data Transfer: 1-10 KB/request
```

### Acceptable Behavior (Test/Staging):
```
Success Rate: > 95%
Response Time p95: < 2000ms
Response Time p99: < 3000ms
Checks Pass Rate: > 75%
Request Rate: 1-50 req/sec
```

### Critical State (Requires Immediate Action):
```
Success Rate: < 90%
Response Time p99: > 5000ms
Checks Pass Rate: < 50%
Error Rate: > 10%
```

---

## How to Receive Alerts

### 1. Email (already configured)
Alerts are sent to `devops@skipr.network`

### 2. Slack/Discord Webhook
Uncomment in `notification-policies.yml`:
```yaml
- orgId: 1
  name: slack-alerts
  receivers:
    - uid: slack-webhook
      type: slack
      settings:
        url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

### 3. Telegram Bot
Add in Grafana UI:
- Alerting → Contact points → New contact point
- Type: Telegram
- Bot Token: get from @BotFather
- Chat ID: get from @userinfobot

### 4. PagerDuty/Opsgenie (for production)
Integration via Grafana contact points

---

## Where to View Alerts in Grafana

1. **Alerting → Alert rules** - all rules
2. **Alerting → Silences** - disable temporarily
3. **Dashboard annotations** - red lines on charts
4. **Alerting → Notification policies** - who to notify

---

## Starting Alerting

```bash
# Restart Grafana with alerting
cd docker
docker-compose -f docker-compose.monitoring.yml up -d --force-recreate grafana

# Check alert rules
curl http://localhost:3000/api/ruler/grafana/api/v1/rules -u admin:admin

# Test run (simulate errors)
cd scripts/k6
.\run-test.ps1  # If test fails, alert will trigger
```

---

## Testing Alerts

```powershell
# 1. Simulate low success rate (stop backend)
docker stop skipr-agent
.\run-test.ps1  # All requests will fail → alert

# 2. Simulate high latency (limit CPU)
docker update --cpus="0.1" skipr-agent
.\run-test.ps1  # Slow responses → alert

# 3. Simulate absence of tests
# Simply don't run tests for 10 minutes → alert
```

Alerts are ready! Restart Grafana:
```powershell
cd d:\Work\Skipr\performance_testing\docker
docker-compose -f docker-compose.monitoring.yml up -d --force-recreate grafana
```
