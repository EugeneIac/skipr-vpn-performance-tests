// k6 Load Test Script для VPN Backend API
// Запуск: k6 run vpn_api_load_test.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

// Custom metrics
const connectionAttempts = new Counter('vpn_connection_attempts');
const connectionSuccesses = new Counter('vpn_connection_successes');
const connectionFailures = new Counter('vpn_connection_failures');
const connectionTime = new Trend('vpn_connection_time_ms');
const authTime = new Trend('auth_time_ms');
const successRate = new Rate('connection_success_rate');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'https://api.skipr.network';
const TEST_DURATION = __ENV.TEST_DURATION || '10m';
const TARGET_VUS = parseInt(__ENV.TARGET_VUS || '100');

export const options = {
  // Сценарий нагрузки: постепенное увеличение
  stages: [
    { duration: '2m', target: Math.floor(TARGET_VUS * 0.2) },   // Ramp-up to 20%
    { duration: '3m', target: Math.floor(TARGET_VUS * 0.5) },   // Ramp-up to 50%
    { duration: '2m', target: TARGET_VUS },                     // Ramp-up to 100%
    { duration: TEST_DURATION, target: TARGET_VUS },            // Stay at 100%
    { duration: '2m', target: Math.floor(TARGET_VUS * 0.5) },   // Ramp-down to 50%
    { duration: '2m', target: 0 },                              // Ramp-down to 0
  ],

  // Пороги (thresholds) - если не выполнены, тест считается failed
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<3000'],  // 95% < 2s, 99% < 3s
    http_req_failed: ['rate<0.01'],                    // Ошибок менее 1%
    connection_success_rate: ['rate>0.99'],            // Success rate > 99%
    vpn_connection_time_ms: ['p(95)<3000'],            // 95% подключений < 3s
    auth_time_ms: ['p(95)<500'],                       // 95% аутентификаций < 500ms
  },

  // Настройки для distributed testing (если используете k6 cloud)
  ext: {
    loadimpact: {
      projectID: 12345,
      name: 'VPN Backend Load Test',
    },
  },
};

// Setup function - выполняется один раз перед тестом
export function setup() {
  console.log(`Starting VPN Load Test against ${BASE_URL}`);
  console.log(`Target VUs: ${TARGET_VUS}`);
  console.log(`Test duration: ${TEST_DURATION}`);
  return { startTime: new Date() };
}

// Main test function - выполняется каждой VU (Virtual User)
export default function (data) {
  const userId = `user_${__VU}_${__ITER}`;

  // 1. Authentication
  const authStartTime = Date.now();
  const authPayload = JSON.stringify({
    username: userId,
    password: 'test_password_123',
    deviceId: `android_device_${__VU}`,
    deviceType: 'android',
    appVersion: '1.0.0',
  });

  const authHeaders = {
    'Content-Type': 'application/json',
    'User-Agent': 'Skipr-Android/1.0.0',
  };

  const authRes = http.post(`${BASE_URL}/auth/login`, authPayload, {
    headers: authHeaders,
    tags: { name: 'Auth_Login' },
  });

  const authSuccess = check(authRes, {
    'auth status is 200': (r) => r.status === 200,
    'auth has token': (r) => r.json('token') !== undefined,
    'auth response time < 1s': (r) => r.timings.duration < 1000,
  });

  authTime.add(Date.now() - authStartTime);

  if (!authSuccess) {
    connectionFailures.add(1);
    console.error(`Authentication failed for ${userId}: ${authRes.status}`);
    sleep(5);
    return;
  }

  const token = authRes.json('token');

  // Small delay to simulate user behavior
  sleep(1);

  // 2. Get VPN Server List
  const serversRes = http.get(`${BASE_URL}/vpn/servers`, {
    headers: {
      ...authHeaders,
      'Authorization': `Bearer ${token}`,
    },
    tags: { name: 'Get_VPN_Servers' },
  });

  check(serversRes, {
    'servers list retrieved': (r) => r.status === 200,
    'servers list not empty': (r) => {
      const servers = r.json('servers');
      return servers && servers.length > 0;
    },
  });

  // 3. Get VPN Configuration
  const configRes = http.get(`${BASE_URL}/vpn/config`, {
    headers: {
      ...authHeaders,
      'Authorization': `Bearer ${token}`,
    },
    tags: { name: 'Get_VPN_Config' },
  });

  check(configRes, {
    'config received': (r) => r.status === 200,
    'config has ovpn data': (r) => r.json('ovpn') !== undefined,
  });

  sleep(2);

  // 4. Initiate VPN Connection
  const connectionStartTime = Date.now();
  connectionAttempts.add(1);

  const connectPayload = JSON.stringify({
    serverId: 'server_1',
    protocol: 'openvpn',
    deviceId: `android_device_${__VU}`,
  });

  const connectRes = http.post(`${BASE_URL}/vpn/connect`, connectPayload, {
    headers: {
      ...authHeaders,
      'Authorization': `Bearer ${token}`,
    },
    tags: { name: 'VPN_Connect' },
  });

  const connectSuccess = check(connectRes, {
    'connection initiated': (r) => r.status === 200 || r.status === 201,
    'connection has session id': (r) => r.json('sessionId') !== undefined,
  });

  const connectionDuration = Date.now() - connectionStartTime;
  connectionTime.add(connectionDuration);

  if (connectSuccess) {
    connectionSuccesses.add(1);
    successRate.add(true);
  } else {
    connectionFailures.add(1);
    successRate.add(false);
    console.error(`Connection failed for ${userId}: ${connectRes.status}`);
  }

  const sessionId = connectRes.json('sessionId');

  // 5. Simulate active connection with periodic heartbeats
  const connectionDurationSeconds = Math.floor(Math.random() * 300) + 60; // 60-360 seconds
  const heartbeatInterval = 30; // seconds
  const heartbeats = Math.floor(connectionDurationSeconds / heartbeatInterval);

  for (let i = 0; i < heartbeats; i++) {
    sleep(heartbeatInterval);

    // Send heartbeat
    const heartbeatRes = http.post(
      `${BASE_URL}/vpn/heartbeat`,
      JSON.stringify({ sessionId }),
      {
        headers: {
          ...authHeaders,
          'Authorization': `Bearer ${token}`,
        },
        tags: { name: 'VPN_Heartbeat' },
      }
    );

    check(heartbeatRes, {
      'heartbeat successful': (r) => r.status === 200,
    });
  }

  // 6. Get connection stats
  const statsRes = http.get(`${BASE_URL}/vpn/stats/${sessionId}`, {
    headers: {
      ...authHeaders,
      'Authorization': `Bearer ${token}`,
    },
    tags: { name: 'Get_Connection_Stats' },
  });

  check(statsRes, {
    'stats retrieved': (r) => r.status === 200,
  });

  sleep(2);

  // 7. Disconnect
  const disconnectRes = http.post(
    `${BASE_URL}/vpn/disconnect`,
    JSON.stringify({ sessionId }),
    {
      headers: {
        ...authHeaders,
        'Authorization': `Bearer ${token}`,
      },
      tags: { name: 'VPN_Disconnect' },
    }
  );

  check(disconnectRes, {
    'disconnect successful': (r) => r.status === 200,
  });

  // Small delay before next iteration
  sleep(Math.random() * 5 + 2); // 2-7 seconds
}

// Teardown function - выполняется один раз после теста
export function teardown(data) {
  const endTime = new Date();
  const duration = (endTime - data.startTime) / 1000;
  console.log(`Test completed. Duration: ${duration} seconds`);
}

// Handle summary - генерация отчета
export function handleSummary(data) {
  return {
    '../results/summary.html': htmlReport(data),
    '../results/summary.json': JSON.stringify(data),
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
  };
}
