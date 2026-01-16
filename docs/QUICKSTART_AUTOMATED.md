# 🎯 Quick Start - Automated Setup

## 🚀 One-Command Setup

```powershell
# Windows PowerShell
cd d:\Work\Skipr\performance_testing
make quickstart
```

```bash
# Linux/macOS
cd /path/to/performance_testing
make quickstart
```

**What happens:**
1. ✅ Installs npm dependencies
2. ✅ Builds k6 TypeScript tests
3. ✅ Starts Docker monitoring stack
4. ✅ Grafana auto-configures with dashboards
5. ✅ Ready to test!

---

## 📊 Access Grafana

**URL:** http://localhost:3000
**Login:** admin
**Password:** admin

**Dashboard:** Performance Testing → VPN Backend - K6 Load Testing

---

## 🧪 Run Your First Test

```powershell
# Windows
cd scripts\k6
.\run-test.ps1

# Linux/Mac
cd scripts/k6
bash run-test.sh
```

**Or use Makefile:**
```bash
make test-smoke
```

**Watch metrics in real-time in Grafana!** 📈

---

## 🛑 Stop Everything

```bash
make stop
```

---

## 🔄 Full CI/CD Documentation

See [CICD_SETUP.md](CICD_SETUP.md) for complete guide including:
- GitHub Actions integration
- GitLab CI examples
- Jenkins pipeline
- Troubleshooting

---

## ✅ Verify Setup

Run this command to check everything:

```bash
# Check services
docker-compose -f docker/docker-compose.monitoring.yml ps

# Should show all "Up":
# - vpn-grafana
# - vpn-prometheus  
# - vpn-influxdb
# - vpn-node-exporter
```

**All green? You're ready to test! 🎉**
