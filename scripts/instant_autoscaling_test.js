// k6 Auto-Scaling Test для Skipr Instant Servers
// Цель: Проверка автоматического создания новых Instant серверов при достижении threshold
// Threshold: 5 клиентов на одном Instant сервере
// Запуск: k6 run instant_autoscaling_test.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate, Gauge } from 'k6/metrics';
import ws from 'k6/ws';
import { randomBytes } from 'k6/crypto';
import encoding from 'k6/encoding';

// ============================================
// TEST ENVIRONMENT CONFIGURATION
// ============================================

const AGENT_URL = 'https://65.0.32.101:443';
const AGENT_WS_URL = 'wss://65.0.32.101:4433';
const SIGNING_SERVICE = 'http://18.153.81.95:3000';
const S3_SHARED = 'https://skipr-shared-test.s3.us-west-2.amazonaws.com';

const REGION = 'switzerland'; // Тестируем на одном регионе
const PROTOCOL = 'wireguard';
const THRESHOLD = 5; // Клиентов на сервер

// ============================================
// CUSTOM METRICS
// ============================================

const provisionRequests = new Counter('provision_requests_total');
const provisionSuccesses = new Counter('provision_successes_total');
const provisionFailures = new Counter('provision_failures_total');
const provisionTime = new Trend('provision_time_ms');

const newInstantCreated = new Counter('new_instant_servers_created');
const instantServerCount = new Gauge('instant_servers_count');
const clientsPerServer = new Gauge('clients_per_server');
const scalingTriggerTime = new Trend('scaling_trigger_time_ms');

const wsConnectionSuccess = new Rate('websocket_connection_success');
const configReceived = new Rate('config_received_rate');

// Track which Instant servers were created during test
let discoveredServers = new Set();
let serverClientCount = {}; // { "IP": count }

// ============================================
// TEST CONFIGURATION
// ============================================

export const options = {
  scenarios: {
    // Scenario 1: Постепенное добавление клиентов
    gradual_scaling: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 5 },   // 1-5 клиентов (threshold)
        { duration: '2m', target: 5 },   // Удерживаем 5
        { duration: '1m', target: 8 },   // 6-8 клиентов (trigger scaling)
        { duration: '3m', target: 8 },   // Ждем создания нового сервера
        { duration: '1m', target: 12 },  // 9-12 клиентов
        { duration: '3m', target: 12 },  // Устойчивое состояние
        { duration: '1m', target: 0 },   // Ramp down
      ],
      gracefulRampDown: '30s',
    },
  },

  thresholds: {
    'provision_successes_total': ['count > 10'],
    'provision_time_ms': ['p(95) < 15000'], // Provision может занимать до 15 сек
    'websocket_connection_success': ['rate > 0.95'],
    'config_received_rate': ['rate > 0.90'],
    'http_req_failed': ['rate < 0.1'],
  },

  insecureSkipTLSVerify: true, // Для self-signed сертификатов
};

// ============================================
// HELPER FUNCTIONS
// ============================================

// Генерация Ed25519 ключей через signing service
function generateKeys() {
  const res = http.post(`${SIGNING_SERVICE}/generate-keys`, null, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'Generate_Keys' },
  });

  if (res.status === 200) {
    const keys = res.json();
    return {
      privateKey: keys.privateKey,
      publicKey: keys.publicKey,
      deviceId: keys.deviceId || generateDeviceId(keys.publicKey),
    };
  }

  // Fallback - используем тестовые ключи
  console.warn('Failed to generate keys, using test keys');
  return {
    privateKey: '33dd5cfd940c06605feb76a616756961f6a6535a962d1f78b0a3745801273836',
    publicKey: '77e0e65fd0edba020b29dbc8bfda1ebde8aa5d6ead38339a86a2e49ea9157e0e',
    deviceId: 'c7a91f9aa35dae4eef1f73f8fb39fffe4f62a2e1',
  };
}

// Генерация device_id из publicKey (SHA-1)
function generateDeviceId(publicKey) {
  // Упрощенная версия - в реальности нужен SHA-1
  return `device_${publicKey.substring(0, 40)}`;
}

// Подпись запроса через signing service
function signRequest(message, privateKey, publicKey) {
  const payload = JSON.stringify({
    message: message,
    privateKey: privateKey,
    publicKey: publicKey,
  });

  const res = http.post(`${SIGNING_SERVICE}/sign`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'Sign_Request' },
  });

  if (res.status === 200) {
    return res.json().signature;
  }

  console.error('Failed to sign request:', res.status, res.body);
  return null;
}

// ============================================
// SETUP
// ============================================

export function setup() {
  console.log('========================================');
  console.log('Skipr Instant Auto-Scaling Test');
  console.log('========================================');
  console.log(`Agent: ${AGENT_URL}`);
  console.log(`WebSocket: ${AGENT_WS_URL}`);
  console.log(`Signing Service: ${SIGNING_SERVICE}`);
  console.log(`Region: ${REGION}`);
  console.log(`Threshold: ${THRESHOLD} clients per server`);
  console.log('========================================');

  // Получаем начальный список Instant серверов
  const targetsRes = http.get(`${S3_SHARED}/targets_instant.json`);
  const initialServers = targetsRes.json();

  console.log(`Initial Instant Servers: ${initialServers.length}`);
  initialServers.forEach(s => {
    console.log(`  - ${s.country} (${s.region}): ${s.ip_address}`);
    discoveredServers.add(s.ip_address);
    serverClientCount[s.ip_address] = 0;
  });

  return {
    startTime: new Date().toISOString(),
    initialServerCount: initialServers.length,
    initialServers: initialServers,
  };
}

// ============================================
// MAIN TEST FUNCTION
// ============================================

export default function (data) {
  const vuId = __VU;
  const iterationId = __ITER;
  const clientId = `VU${vuId}_ITER${iterationId}`;

  group('Client Provision Flow', function () {
    // 1. Генерация credentials для этого клиента
    const credentials = generateKeys();
    console.log(`[${clientId}] Generated credentials: deviceId=${credentials.deviceId.substring(0, 20)}...`);

    sleep(1);

    // 2. Проверка лицензии (опционально, можем пропустить для упрощения)
    // Для теста предполагаем что лицензия валидна

    // 3. Provision запрос
    const provisionStartTime = Date.now();
    provisionRequests.add(1);

    const provisionPayload = {
      ip_address: '83.5.133.110', // Fake IP
      is_ip_address_static: false,
      region: REGION,
      service_type: 'instant',
      public_key: credentials.publicKey,
      device_id: credentials.deviceId,
      protocol: PROTOCOL,
    };

    const message = JSON.stringify(provisionPayload);
    const signature = signRequest(message, credentials.privateKey, credentials.publicKey);

    if (!signature) {
      console.error(`[${clientId}] Failed to generate signature`);
      provisionFailures.add(1);
      return;
    }

    const provisionRes = http.post(`${AGENT_URL}/provision/do`, message, {
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
      },
      tags: { name: 'Provision_Request' },
    });

    const provisionSuccess = check(provisionRes, {
      'provision status 200 or 201': (r) => r.status === 200 || r.status === 201,
      'provision has provision_id': (r) => {
        try {
          return r.json().provision_id !== undefined;
        } catch (e) {
          return false;
        }
      },
    });

    if (!provisionSuccess) {
      console.error(`[${clientId}] Provision failed: ${provisionRes.status} ${provisionRes.body}`);
      provisionFailures.add(1);
      return;
    }

    const provisionId = provisionRes.json().provision_id;
    console.log(`[${clientId}] Provision initiated: ${provisionId}`);
    provisionSuccesses.add(1);

    // 4. WebSocket подписка для получения config URL
    const wsUrl = AGENT_WS_URL;
    let configUrl = null;
    let instantServerIp = null;

    const wsSuccess = ws.connect(wsUrl, { tags: { name: 'WebSocket_Connection' } }, function (socket) {
      socket.on('open', function () {
        console.log(`[${clientId}] WebSocket connected`);
        wsConnectionSuccess.add(true);

        // Подписка на provision_id topic
        socket.send(JSON.stringify({
          event: 'subscribe',
          topic: provisionId,
        }));
      });

      socket.on('message', function (message) {
        console.log(`[${clientId}] WebSocket message: ${message}`);

        try {
          const data = JSON.parse(message);
          if (data.url) {
            configUrl = data.url;
            // Извлекаем IP Instant сервера из URL
            // URL format: https://IP/?device_id=...&protocol=...
            const urlMatch = configUrl.match(/https?:\/\/([0-9.]+)/);
            if (urlMatch) {
              instantServerIp = urlMatch[1];
              console.log(`[${clientId}] Assigned to Instant Server: ${instantServerIp}`);

              // Отслеживаем распределение клиентов
              if (!serverClientCount[instantServerIp]) {
                serverClientCount[instantServerIp] = 0;

                // Новый сервер обнаружен!
                if (!discoveredServers.has(instantServerIp)) {
                  discoveredServers.add(instantServerIp);
                  newInstantCreated.add(1);

                  const scalingTime = Date.now() - provisionStartTime;
                  scalingTriggerTime.add(scalingTime);

                  console.log(`🎉 [${clientId}] NEW INSTANT SERVER CREATED: ${instantServerIp} (took ${scalingTime}ms)`);
                }
              }

              serverClientCount[instantServerIp]++;
              clientsPerServer.add(serverClientCount[instantServerIp], { server: instantServerIp });

              configReceived.add(true);
            }

            socket.close();
          }
        } catch (e) {
          console.error(`[${clientId}] Failed to parse WebSocket message: ${e}`);
        }
      });

      socket.on('error', function (e) {
        console.error(`[${clientId}] WebSocket error: ${e}`);
        wsConnectionSuccess.add(false);
      });

      socket.on('close', function () {
        console.log(`[${clientId}] WebSocket closed`);
      });

      // Таймаут ожидания - 60 секунд
      socket.setTimeout(function () {
        console.warn(`[${clientId}] WebSocket timeout after 60s`);
        socket.close();
      }, 60000);
    });

    if (!wsSuccess) {
      wsConnectionSuccess.add(false);
      configReceived.add(false);
    }

    const provisionDuration = Date.now() - provisionStartTime;
    provisionTime.add(provisionDuration);

    // 5. Получение VPN конфигурации (опционально)
    if (configUrl) {
      sleep(2);

      const configRes = http.get(configUrl, {
        tags: {
          name: 'Get_VPN_Config',
          instant_server: instantServerIp,
        },
      });

      check(configRes, {
        'config received': (r) => r.status === 200,
        'config is valid': (r) => r.body.length > 100,
      });
    }

    // 6. Симулируем "подключенного" клиента некоторое время
    sleep(10); // Клиент "подключен" 10 секунд

  });

  // Случайная задержка между итерациями
  sleep(Math.random() * 3 + 2); // 2-5 секунд
}

// ============================================
// TEARDOWN
// ============================================

export function teardown(data) {
  console.log('========================================');
  console.log('Test Completed - Auto-Scaling Results');
  console.log('========================================');
  console.log(`Test Duration: ${data.startTime} → ${new Date().toISOString()}`);
  console.log(`Initial Servers: ${data.initialServerCount}`);
  console.log(`Discovered Servers: ${discoveredServers.size}`);
  console.log(`New Servers Created: ${discoveredServers.size - data.initialServerCount}`);
  console.log('');
  console.log('Client Distribution:');

  Object.entries(serverClientCount).forEach(([ip, count]) => {
    const isNew = !data.initialServers.some(s => s.ip_address === ip);
    console.log(`  ${ip}: ${count} clients ${isNew ? '🆕 (NEW)' : ''}`);
  });

  console.log('========================================');

  // Отправляем результаты на проверку
  const finalTargetsRes = http.get(`${S3_SHARED}/targets_instant.json`);
  const finalServers = finalTargetsRes.json();

  console.log(`Final Instant Servers in targets.json: ${finalServers.length}`);

  instantServerCount.add(finalServers.length);
}
