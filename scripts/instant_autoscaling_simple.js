// k6 Simplified Auto-Scaling Test для Skipr Instant Servers
// Использует готовые тестовые credentials для упрощения
// Цель: Проверка auto-scaling при threshold = 5 клиентов
// Запуск: k6 run instant_autoscaling_simple.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Gauge } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// ============================================
// TEST ENVIRONMENT
// ============================================

const AGENT_URL = 'https://65.0.32.101:443';
const SIGNING_SERVICE = 'http://18.153.81.95:3000';
const S3_SHARED = 'https://skipr-shared-test.s3.us-west-2.amazonaws.com';

// Тестовые credentials из Postman (TEST environment)
const TEST_PRIVATE_KEY = '33dd5cfd940c06605feb76a616756961f6a6535a962d1f78b0a3745801273836';
const TEST_PUBLIC_KEY = '77e0e65fd0edba020b29dbc8bfda1ebde8aa5d6ead38339a86a2e49ea9157e0e';
const TEST_DEVICE_ID_BASE = 'c7a91f9aa35dae4eef1f73f8fb39fffe4f62a2';

const REGION = 'switzerland';
const PROTOCOL = 'wireguard';
const THRESHOLD = 5;

// ============================================
// CUSTOM METRICS
// ============================================

const provisionRequests = new Counter('provision_requests');
const provisionSuccesses = new Counter('provision_successes');
const instantServersCount = new Gauge('instant_servers_count');
const newServersCreated = new Counter('new_servers_created');

// ============================================
// CONFIG
// ============================================

export const options = {
  scenarios: {
    auto_scaling_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        // Phase 1: Baseline (до threshold)
        { duration: '1m', target: 3 },
        { duration: '1m', target: 3 },

        // Phase 2: Достигаем threshold
        { duration: '30s', target: 5 },
        { duration: '2m', target: 5 }, // Держим на пороге

        // Phase 3: Превышаем threshold (trigger scaling)
        { duration: '30s', target: 7 },
        { duration: '5m', target: 7 }, // Ждем создания нового сервера

        // Phase 4: Продолжаем увеличивать
        { duration: '30s', target: 10 },
        { duration: '3m', target: 10 },

        // Ramp down
        { duration: '1m', target: 0 },
      ],
    },
  },

  thresholds: {
    'provision_requests': ['count > 0'],
    'http_req_failed': ['rate < 0.2'], // Допускаем 20% ошибок (т.к. можем не иметь валидных лицензий)
  },

  insecureSkipTLSVerify: true,
};

// ============================================
// HELPERS
// ============================================

function signRequest(message, privateKey, publicKey) {
  const payload = JSON.stringify({
    message: message,
    privateKey: privateKey,
    publicKey: publicKey,
  });

  const res = http.post(`${SIGNING_SERVICE}/sign`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (res.status === 200) {
    return res.json().signature;
  }

  return null;
}

// ============================================
// SETUP
// ============================================

export function setup() {
  console.log('========================================');
  console.log('Skipr Instant Auto-Scaling Test (Simplified)');
  console.log('========================================');
  console.log(`Agent: ${AGENT_URL}`);
  console.log(`Region: ${REGION}`);
  console.log(`Threshold: ${THRESHOLD} clients`);
  console.log('========================================');

  // Получаем начальное количество серверов
  const targetsRes = http.get(`${S3_SHARED}/targets_instant.json`);
  const initialServers = targetsRes.json();

  console.log(`\nInitial Instant Servers: ${initialServers.length}`);
  initialServers.forEach((s, idx) => {
    console.log(`  ${idx + 1}. ${s.country || 'Unknown'} (${s.region}): ${s.ip_address}`);
  });
  console.log('');

  return {
    startTime: Date.now(),
    initialServerCount: initialServers.length,
    initialServers: initialServers,
  };
}

// ============================================
// MAIN TEST
// ============================================

export default function (data) {
  const vu = __VU;
  const iter = __ITER;

  // Уникальный device_id для каждого VU
  const deviceId = `${TEST_DEVICE_ID_BASE}${String(vu).padStart(2, '0')}`;

  console.log(`[VU${vu}:${iter}] Starting provision with device_id=${deviceId}`);

  // Provision payload
  const provisionPayload = {
    ip_address: `83.5.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    is_ip_address_static: false,
    region: REGION,
    service_type: 'instant',
    public_key: TEST_PUBLIC_KEY,
    device_id: deviceId,
    protocol: PROTOCOL,
  };

  const message = JSON.stringify(provisionPayload);

  // Подпись через signing service
  const signature = signRequest(message, TEST_PRIVATE_KEY, TEST_PUBLIC_KEY);

  if (!signature) {
    console.error(`[VU${vu}:${iter}] Failed to sign request`);
    return;
  }

  provisionRequests.add(1);

  // Отправка provision запроса
  const provisionRes = http.post(`${AGENT_URL}/provision/do`, message, {
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': signature,
    },
  });

  const success = check(provisionRes, {
    'provision accepted': (r) => r.status === 200 || r.status === 201,
  });

  if (success) {
    provisionSuccesses.add(1);
    const body = provisionRes.json();
    console.log(`[VU${vu}:${iter}] ✅ Provision initiated: ${body.provision_id || 'N/A'}`);
  } else {
    console.log(`[VU${vu}:${iter}] ❌ Provision failed: ${provisionRes.status} - ${provisionRes.body}`);
  }

  // Проверяем targets.json - появились ли новые серверы
  if (iter % 10 === 0) { // Каждую 10-ю итерацию
    const currentTargetsRes = http.get(`${S3_SHARED}/targets_instant.json`);
    if (currentTargetsRes.status === 200) {
      const currentServers = currentTargetsRes.json();
      instantServersCount.add(currentServers.length);

      if (currentServers.length > data.initialServerCount) {
        const newCount = currentServers.length - data.initialServerCount;
        console.log(`\n🎉 [VU${vu}:${iter}] NEW SERVERS DETECTED! Total: ${currentServers.length} (+${newCount})\n`);
        newServersCreated.add(newCount);
      }
    }
  }

  // Симулируем "подключенного" клиента
  sleep(30); // Клиент остается "подключенным" 30 секунд
}

// ============================================
// TEARDOWN
// ============================================

export function teardown(data) {
  console.log('\n========================================');
  console.log('Test Completed - Final Results');
  console.log('========================================');

  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Test Duration: ${Math.floor(duration / 60)}m ${Math.floor(duration % 60)}s`);

  // Финальная проверка серверов
  const finalTargetsRes = http.get(`${S3_SHARED}/targets_instant.json`);
  if (finalTargetsRes.status === 200) {
    const finalServers = finalTargetsRes.json();

    console.log(`\nInitial Servers: ${data.initialServerCount}`);
    console.log(`Final Servers: ${finalServers.length}`);
    console.log(`New Servers Created: ${finalServers.length - data.initialServerCount}`);

    if (finalServers.length > data.initialServerCount) {
      console.log('\n🎉 AUTO-SCALING WORKED! New servers:');
      finalServers.forEach(s => {
        const isNew = !data.initialServers.some(init => init.ip_address === s.ip_address);
        if (isNew) {
          console.log(`  ✨ ${s.country || 'Unknown'} (${s.region}): ${s.ip_address}`);
        }
      });
    } else {
      console.log('\n⚠️  No new servers created during test');
      console.log('Possible reasons:');
      console.log('  - Threshold not reached');
      console.log('  - Auto-scaling disabled in TEST environment');
      console.log('  - Provision requests failed (check logs)');
    }
  }

  console.log('========================================\n');
}
