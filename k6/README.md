# K6 Performance Tests for Skipr VPN API

TypeScript-based k6 performance testing framework for Skipr VPN backend.

## 📁 Structure

```
scripts/k6/
├── utils/           # Helper utilities
│   ├── Helper.ts    # Ed25519 signing, key generation
│   ├── Constants.ts # API constants (status codes, messages)
│   └── Config.ts    # Configuration interfaces
├── requests/        # API request classes
│   ├── Shared.ts    # Public endpoints (agents.json, targets_instant.json)
│   ├── Agent.ts     # Agent status checks
│   ├── License.ts   # License activation and status
│   └── Provision.ts # Provision requests
├── scenarios/       # K6 load profiles
│   └── Base.ts      # debug, load, stress, performance, spike
├── tests/           # K6 test scripts
│   ├── instant-servers.test.ts  # Check instant servers availability
│   └── e2e-simple.test.ts       # E2E flow without WebSocket
└── env.example.json # Configuration template
```

## 🚀 Quick Start

### Prerequisites

- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) installed
- Node.js & npm (for TypeScript compilation)
- Webpack (for bundling)

### Installation

```bash
cd scripts/k6
npm install
```

### Configuration

1. Copy env example:
   ```bash
   cp env.example.json env.json
   ```

2. Edit `env.json` with your test environment credentials

### Running Tests

#### Method 1: Direct k6 execution (no TypeScript)

For simple tests without TypeScript compilation:

```bash
# Check instant servers
k6 run --insecure-skip-tls-verify tests/instant-servers.test.js

# E2E flow
k6 run --insecure-skip-tls-verify tests/e2e-simple.test.js
```

#### Method 2: With TypeScript compilation (recommended)

```bash
# Compile TypeScript to JavaScript
npm run build

# Run compiled tests
k6 run --insecure-skip-tls-verify dist/instant-servers.test.js
k6 run --insecure-skip-tls-verify dist/e2e-simple.test.js
```

### Load Testing

Override scenario via command line:

```bash
# Load test: Ramp up to 75 VUs
k6 run --insecure-skip-tls-verify dist/e2e-simple.test.js \
  --vus 75 --duration 2m

# Stress test: 100 req/s for 5 minutes
k6 run --insecure-skip-tls-verify dist/e2e-simple.test.js \
  --stage 3m:50,5m:100

# Performance test: Constant 25 VUs for 10 minutes
k6 run --insecure-skip-tls-verify dist/e2e-simple.test.js \
  --vus 25 --duration 10m
```

### Output to Grafana/Prometheus

Export metrics for monitoring stack:

```bash
k6 run --insecure-skip-tls-verify dist/e2e-simple.test.js \
  --out json=results.json \
  --out statsd
```

## 📊 Test Scenarios

Available in `scenarios/Base.ts`:

- **debug**: 1 VU, 1 iteration (quick validation)
- **load**: Ramp 1→50→75 VUs (find capacity)
- **stress**: Ramp 10→100 req/s (breaking point)
- **performance**: 25 VUs for 10m (sustained load)
- **spike**: 1→100→1 VUs (burst capacity)

### 📖 Что такое VU?

**VU (Virtual User)** = Виртуальный пользователь

- **1 VU** = 1 параллельный исполнитель теста (как один реальный пользователь)
- **50 VUs** = 50 одновременных пользователей, каждый выполняет свой цикл запросов

**Пример**: `--vus 50 --duration 5m`
- Запустит 50 виртуальных пользователей
- Каждый будет выполнять тест параллельно
- В течение 5 минут

**Stage example**: `--stage 2m:10,3m:50,2m:0`
- За 2 минуты увеличить до 10 VUs
- За 3 минуты увеличить до 50 VUs
- За 2 минуты снизить до 0 VUs

## 🔐 Ed25519 Authentication

All API requests use Ed25519 signatures:

```typescript
import { Helper } from '../utils/Helper';

const helper = new Helper();
const [publicKey, secretKey] = helper.generateKeyPair();
const signature = helper.generateEd25519Signature(payload, secretKey, publicKey);

// Attach to request headers:
headers: {
  'X-Signature': signature,
  'X-Public-Key': publicKey  // (if required by endpoint)
}
```

## 📝 Test Flow Examples

### Simple Agent Check

```typescript
import { Agent } from '../requests/Agent';

const agent = new Agent('https://1.2.3.4:443');
const statusRes = agent.getStatus();
agent.testGetStatus(statusRes);
```

### Full E2E Flow

```typescript
// 1. Get agents
const shared = new Shared(sharedUrl);
const agentsRes = shared.getAgentServers();
const baseUrl = shared.getBaseUrl(agentsRes);

// 2. Activate license
const license = new License(baseUrl);
const paidRes = license.paid(config);

// 3. Request provision
const provision = new Provision(baseUrl);
const provRes = provision.do(config);
const provisionId = provision.getProvisionId(provRes);

// 4. Track provision (use WebSocket - see ../monitor_provision_complete.js)
```

## ⚠️ Limitations

### WebSocket Support

k6 does NOT support Socket.IO. For provision tracking:

1. Use k6 to send provision request
2. Use separate Node.js script for WebSocket tracking

See: `../monitor_provision_complete.js` for WebSocket implementation

### Hybrid Approach

```bash
# Terminal 1: Run k6 load test
k6 run --insecure-skip-tls-verify dist/e2e-simple.test.js --vus 50

# Terminal 2: Monitor provision completions
node ../monitor_provision_complete.js
```

## 🔧 Configuration

Edit test configuration in individual test files or create environment-specific configs:

```typescript
const CONFIG = {
    sharedUrl: 'https://skipr-shared-test.s3.us-west-2.amazonaws.com',
    license: {
        plan_id: 'staging_standard_monthly_subscription',
        // ...
    },
    provision: {
        service_type: 'instant',
        region: 'spain',
        // ...
    },
};
```

## 📈 Metrics & Thresholds

Default thresholds:

```typescript
thresholds: {
    'http_req_duration': ['p(95)<2000'], // 95% < 2s
    'http_req_failed': ['rate<0.01'],    // Error rate < 1%
    'checks': ['rate>0.99'],             // 99% checks pass
}
```

Override in test options:

```typescript
export const options = getConfigWithThresholds('load', {
    'http_req_duration': ['p(99)<5000'],
    'checks': ['rate>0.95'],
});
```

## 🐛 Troubleshooting

### TLS Certificate Errors
Use `--insecure-skip-tls-verify` flag for self-signed certs on test agents

### Signature Authentication Failed (401)
- Check secret_key and public_key generation
- Verify payload is correct JSON string
- Ensure X-Signature header is present

### License Already Active
License activation may fail if device_id already has active license. Generate new credentials.

### Provision Timeout
Provision requests can take 30-60s for new server creation. Use WebSocket to track completion.

## 📚 Related Documentation

- [E2E_FLOW_SUMMARY.md](../../E2E_FLOW_SUMMARY.md) - Full E2E flow explanation
- [vpn_performance_testing_strategy.md](../../vpn_performance_testing_strategy.md) - Testing strategy
- [QUICKSTART.md](../../QUICKSTART.md) - Project quickstart guide

## 🔗 Integration with Monitoring

Start monitoring stack:

```bash
cd ../../docker
docker-compose up -d
```

Access:
- Grafana: http://localhost:3000
- Prometheus: http://localhost:9090

K6 metrics will appear in Grafana dashboards automatically.
