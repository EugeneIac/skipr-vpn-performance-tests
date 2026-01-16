# Grafana Configuration Guide

## 🎯 Automatic Setup (Recommended)

### 1. Restart monitoring stack

```bash
cd docker
docker-compose down
docker-compose up -d
```

**What will happen automatically:**
- ✅ Prometheus will connect as primary data source
- ✅ InfluxDB will connect for k6 metrics
- ✅ Dashboard "VPN Backend - K6 Load Testing" will load automatically

### 2. Open Grafana

```
URL: http://localhost:3000
Login: admin
Password: admin
```

On first login, it will ask to change password - you can skip it.

### 3. Check Data Sources

Navigate to **Configuration → Data Sources** and make sure you see:
- ✅ **Prometheus** - http://prometheus:9090 (default)
- ✅ **InfluxDB** - http://influxdb:8086

### 4. Open dashboard

**Dashboards → Browse → Performance Testing → VPN Backend - K6 Load Testing**

---

## 📊 Displayed Metrics

### K6 Load Testing Metrics (InfluxDB)

| Panel | Metric | Description |
|--------|---------|----------|
| **Virtual Users (VUs)** | `vus` | Number of parallel VUs at the moment |
| **HTTP Request Duration (p95)** | `http_req_duration` p95 | 95th percentile of API response time |
| **Request Rate (RPS)** | `http_reqs` rate | Requests per second |
| **Success Rate** | `http_req_failed` | % of successful requests (200-299 status) |
| **Data Received/Sent** | `data_received`, `data_sent` | Throughput |
| **HTTP Status Codes** | `http_reqs` by status | Distribution of status codes (200, 401, 500...) |
| **Response Time Distribution** | `http_req_duration` heatmap | Latency heatmap |
| **Checks Success Rate** | `checks` | % of successful checks (k6 checks) |
| **Iterations Rate** | `iterations` | Iteration execution rate |

### System Metrics (Prometheus)

| Panel | Metric | Description |
|--------|---------|----------|
| **CPU Usage** | `node_cpu_seconds_total` | CPU load |
| **Memory Usage** | `node_memory_MemAvailable_bytes` | RAM usage |

---

## 🔧 Manual Setup (if automatic setup didn't work)

### Add Prometheus Data Source

1. **Configuration → Data Sources → Add data source**
2. Select **Prometheus**
3. Settings:
   ```
   Name: Prometheus
   URL: http://prometheus:9090
   Access: Server (default)
   ```
4. **Save & Test** → should show green "Data source is working"

### Add InfluxDB Data Source

1. **Configuration → Data Sources → Add data source**
2. Select **InfluxDB**
3. Settings:
   ```
   Name: InfluxDB
   Query Language: Flux
   URL: http://influxdb:8086
   Auth: Basic auth (optional)
   Organization: skipr
   Token: skipr-token-change-me
   Default Bucket: k6
   ```
4. **Save & Test** → "datasource is working"

### Import dashboard

1. **Dashboards → Import**
2. **Upload JSON file**
3. Select file: `docker/grafana/dashboards/k6-load-testing.json`
4. Select **InfluxDB** as primary data source
5. **Import**

---

## 🚀 Запуск k6 теста с отправкой метрик в InfluxDB

### Обновить k6 тест для отправки в InfluxDB

Добавить в начало k6 скрипта (например, `scripts/k6/tests/e2e-simple.test.ts`):

```typescript
export const options = {
  // ... existing options
  
  ext: {
    loadimpact: {
      projectID: 0,
      name: "VPN Backend E2E Test"
    }
  }
};
```

### Запустить k6 с отправкой метрик

```bash
# Установить переменную окружения
$env:K6_INFLUXDB_ADDR="http://localhost:8086"
$env:K6_INFLUXDB_TOKEN="skipr-token-change-me"
$env:K6_INFLUXDB_ORG="skipr"
$env:K6_INFLUXDB_BUCKET="k6"

# Запустить тест
cd scripts/k6
npm run test:load -- --out influxdb=http://localhost:8086
```

Или через Docker:

```bash
docker run --rm --network host \
  -v "$(pwd)/scripts/k6:/scripts" \
  -e K6_INFLUXDB_ADDR="http://localhost:8086" \
  -e K6_INFLUXDB_TOKEN="skipr-token-change-me" \
  -e K6_INFLUXDB_ORG="skipr" \
  -e K6_INFLUXDB_BUCKET="k6" \
  grafana/k6:latest run /scripts/dist/e2e-simple.test.js \
  --out influxdb
```

---

## 📈 Target Metrics (Thresholds)

These values should display as **green** on the dashboard:

| Metric | Target Value | Criticality |
|---------|------------------|-------------|
| **HTTP Success Rate** | >99% | 🔴 Critical |
| **p95 Response Time** | <2000ms | 🟡 High |
| **Checks Success Rate** | 100% | 🔴 Critical |
| **Error Rate** | <1% | 🟡 High |

---

## 🐛 Troubleshooting

### Dashboard shows "No data"

**Cause:** k6 tests haven't been run yet or don't send metrics to InfluxDB

**Solution:**
1. Run k6 test with `--out influxdb` flag
2. Check InfluxDB logs: `docker logs vpn-influxdb`
3. Make sure bucket `k6` is created:
   ```bash
   curl -X GET http://localhost:8086/api/v2/buckets \
     -H "Authorization: Token skipr-token-change-me"
   ```

### Data Source shows "Connection refused" error

**Cause:** Containers are not in the same Docker network or not running

**Solution:**
```bash
docker-compose down
docker-compose up -d
docker-compose ps  # All should be Up
```

### Prometheus Data Source works, InfluxDB doesn't

**Cause:** Incorrect token or organization

**Solution:**
1. Check `INFLUXDB_TOKEN` variable in docker-compose.yml
2. Recreate container:
   ```bash
   docker-compose down
   docker volume rm docker_influxdb-data  # WARNING: will delete all data
   docker-compose up -d influxdb
   ```

---

## 🎨 Creating Custom Panels

### Example: Provision Success Rate

1. In dashboard click **Add panel**
2. Select **InfluxDB** data source
3. Flux query:
   ```flux
   from(bucket: "k6")
     |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
     |> filter(fn: (r) => r["_measurement"] == "checks")
     |> filter(fn: (r) => r["check"] =~ /provision/)
     |> filter(fn: (r) => r["_field"] == "value")
     |> mean()
     |> map(fn: (r) => ({ r with _value: r._value * 100.0 }))
   ```
4. Visualization: **Gauge** or **Stat**
5. Thresholds: <95% red, >99% green

---

## 📚 Useful Links

- [Grafana Dashboards](http://localhost:3000/dashboards)
- [Prometheus Targets](http://localhost:9090/targets)
- [InfluxDB Buckets](http://localhost:8086/orgs/skipr/load-data/buckets)
- [K6 InfluxDB Output Docs](https://k6.io/docs/results-output/real-time/influxdb/)
