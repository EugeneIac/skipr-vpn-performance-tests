// Complete provision monitoring with WebSocket and auto-scaling detection
// Monitor both provision requests and wait for VPN config URLs

const WebSocket = require('ws');
const https = require('https');
const http = require('http');

// Configuration
const WS_URL = 'wss://15.206.79.110:4433';
const S3_TARGETS = 'https://skipr-shared-test.s3.us-west-2.amazonaws.com/targets_instant.json';
const AGENT = 'https://15.206.79.110:443';
const SIGNING_SERVICE = 'http://18.153.81.95:3000';

const DEVICE_ID = 'c7a91f9aa35dae4eef1f73f8fb39fffe4f62a2e1';
const PUBLIC_KEY = '77e0e65fd0edba020b29dbc8bfda1ebde8aa5d6ead38339a86a2e49ea9157e0e';
const PRIVATE_KEY = '33dd5cfd940c06605feb76a616756961f6a6535a962d1f78b0a3745801273836';

// State
let initialServerCount = 0;
let provisionIds = [];
let receivedUrls = {};
let allMessages = {};

console.log('========================================');
console.log('Complete Provision & Auto-Scaling Monitor');
console.log('========================================');
console.log('Agent:', AGENT);
console.log('WebSocket:', WS_URL);
console.log('Monitoring Duration: 5 minutes');
console.log('');

// Fetch current targets
async function fetchTargets() {
  return new Promise((resolve, reject) => {
    https.get(S3_TARGETS, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Sign and send provision request
async function sendProvisionRequest(protocol) {
  const provisionPayload = {
    ip_address: '83.5.133.110',
    is_ip_address_static: false,
    region: 'switzerland',
    service_type: 'instant',
    public_key: PUBLIC_KEY,
    device_id: DEVICE_ID,
    protocol: protocol
  };

  console.log(`[${protocol.toUpperCase()}] Generating signature...`);

  const signPayload = JSON.stringify({
    message: JSON.stringify(provisionPayload),
    privateKey: PRIVATE_KEY,
    publicKey: PUBLIC_KEY
  });

  const signature = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '18.153.81.95',
      port: 3000,
      path: '/sign',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(signPayload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.signature);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(signPayload);
    req.end();
  });

  console.log(`[${protocol.toUpperCase()}] Sending provision request...`);

  const provisionBody = JSON.stringify(provisionPayload);

  const response = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: '15.206.79.110',
      port: 443,
      path: '/provision/do',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'X-Public-Key': PUBLIC_KEY,
        'Content-Length': Buffer.byteLength(provisionBody)
      },
      rejectUnauthorized: false
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(provisionBody);
    req.end();
  });

  if (response.statusCode === 200 || response.statusCode === 201) {
    const data = JSON.parse(response.body);
    console.log(`[${protocol.toUpperCase()}] ✅ Provision ID: ${data.provision_id}`);
    return { protocol, provisionId: data.provision_id };
  } else {
    console.log(`[${protocol.toUpperCase()}] ❌ Failed: ${response.statusCode}`);
    return null;
  }
}

// Monitor targets for changes
function startTargetsMonitor() {
  console.log('\n--- Starting Targets Monitor (checking every 30s) ---\n');

  const interval = setInterval(async () => {
    try {
      const targets = await fetchTargets();
      const currentCount = targets.targets ? targets.targets.length : 0;
      const timestamp = new Date().toTimeString().split(' ')[0];

      if (currentCount > initialServerCount) {
        const newCount = currentCount - initialServerCount;
        console.log(`\n🎉 [${timestamp}] NEW INSTANT SERVER(S) DETECTED! Total: ${currentCount} (+${newCount})`);
        console.log('New servers:');

        targets.targets.forEach(server => {
          console.log(`  - ${server.country} (${server.region}): ${server.ip_address} [${server.status}]`);
        });
        console.log('');

        initialServerCount = currentCount;
      } else {
        console.log(`[${timestamp}] Instant servers: ${currentCount} (no change)`);
      }
    } catch (error) {
      console.error('Error fetching targets:', error.message);
    }
  }, 30000); // Every 30 seconds

  return interval;
}

// Main execution
(async () => {
  try {
    // Step 1: Get initial server count
    console.log('Step 1: Getting initial Instant server count...');
    const initialTargets = await fetchTargets();
    initialServerCount = initialTargets.targets ? initialTargets.targets.length : 0;
    console.log(`Initial Instant Servers: ${initialServerCount}`);

    if (initialTargets.targets) {
      initialTargets.targets.forEach((server, idx) => {
        console.log(`  ${idx + 1}. ${server.country} (${server.region}): ${server.ip_address} [${server.status}]`);
      });
    }
    console.log('');

    // Step 2: Send provision requests
    console.log('Step 2: Sending provision requests...');
    console.log('');

    const requests = [
      sendProvisionRequest('openvpn'),
      sendProvisionRequest('wireguard')
    ];

    const results = await Promise.all(requests);
    provisionIds = results.filter(r => r !== null);

    if (provisionIds.length === 0) {
      console.log('❌ No successful provision requests. Exiting.');
      process.exit(1);
    }

    console.log(`\n✅ Successfully sent ${provisionIds.length} provision requests`);
    console.log('');

    // Step 3: Connect to WebSocket
    console.log('Step 3: Connecting to WebSocket...');

    const ws = new WebSocket(WS_URL, {
      rejectUnauthorized: false
    });

    ws.on('open', () => {
      console.log('✅ WebSocket connected');
      console.log('');

      // Subscribe to all provision IDs
      provisionIds.forEach(({ protocol, provisionId }) => {
        const subscribeMsg = JSON.stringify({
          event: 'subscribe',
          topic: provisionId
        });

        ws.send(subscribeMsg);
        console.log(`[${protocol.toUpperCase()}] Subscribed to: ${provisionId}`);
        allMessages[provisionId] = [];
      });

      console.log('');
      console.log('--- Listening for provision events (timeout: 5 min) ---');
      console.log('');
    });

    ws.on('message', (data) => {
      const timestamp = new Date().toTimeString().split(' ')[0];

      try {
        const message = JSON.parse(data.toString());

        // Find which provision this message belongs to
        let matchedProvision = null;
        for (const { protocol, provisionId } of provisionIds) {
          if (allMessages[provisionId]) {
            allMessages[provisionId].push(message);
            matchedProvision = { protocol, provisionId };
            break;
          }
        }

        const protocolLabel = matchedProvision ? `[${matchedProvision.protocol.toUpperCase()}]` : '';

        console.log(`[${timestamp}] ${protocolLabel} WebSocket Message:`, JSON.stringify(message, null, 2));

        // Check for URL
        if (message.url) {
          const provisionId = matchedProvision ? matchedProvision.provisionId : 'unknown';
          receivedUrls[provisionId] = message.url;
          console.log(`\n✅ ${protocolLabel} VPN Config URL received!`);
          console.log(`   URL: ${message.url}`);
          console.log('');

          // Try to fetch the config
          const urlMatch = message.url.match(/https?:\/\/([0-9.]+)/);
          if (urlMatch) {
            const instantIp = urlMatch[1];
            console.log(`   Instant Server IP: ${instantIp}`);

            // Test if instant server is reachable
            setTimeout(() => {
              https.get(message.url, { rejectUnauthorized: false }, (res) => {
                console.log(`   Instant Server Response: HTTP ${res.statusCode}`);
                if (res.statusCode === 200) {
                  console.log(`   ✅ Config file is accessible!`);
                } else {
                  console.log(`   ⚠️  Unexpected status code`);
                }
              }).on('error', (err) => {
                console.log(`   ❌ Failed to fetch config: ${err.message}`);
              });
            }, 1000);
          }
        }

        // Check for errors
        if (message.status === 'error') {
          console.log(`   ❌ Error: ${message.description || 'Unknown error'}`);
        }

        console.log('');
      } catch (e) {
        console.log(`[${timestamp}] Raw message:`, data.toString());
      }
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
    });

    ws.on('close', () => {
      console.log('\n⚠️  WebSocket connection closed');
    });

    // Step 4: Start monitoring targets
    const targetsInterval = startTargetsMonitor();

    // Step 5: Set timeout and cleanup
    setTimeout(() => {
      console.log('\n========================================');
      console.log('Monitoring Complete (5 minutes elapsed)');
      console.log('========================================');
      console.log('');

      // Summary
      console.log('📊 Summary:');
      console.log(`Provision Requests Sent: ${provisionIds.length}`);
      console.log(`VPN Config URLs Received: ${Object.keys(receivedUrls).length}`);
      console.log('');

      if (Object.keys(receivedUrls).length > 0) {
        console.log('✅ Received URLs:');
        Object.entries(receivedUrls).forEach(([provisionId, url]) => {
          const provision = provisionIds.find(p => p.provisionId === provisionId);
          console.log(`  [${provision?.protocol.toUpperCase()}] ${url}`);
        });
      } else {
        console.log('❌ No VPN config URLs received');
        console.log('');
        console.log('Possible reasons:');
        console.log('  - All Instant servers are down (502 errors)');
        console.log('  - Auto-scaling is creating new server (takes 30-90 seconds)');
        console.log('  - Provision process failed');
        console.log('');
        console.log('Check all received messages:');
        provisionIds.forEach(({ protocol, provisionId }) => {
          console.log(`\n[${protocol.toUpperCase()}] ${provisionId}:`);
          if (allMessages[provisionId] && allMessages[provisionId].length > 0) {
            allMessages[provisionId].forEach((msg, idx) => {
              console.log(`  ${idx + 1}.`, JSON.stringify(msg));
            });
          } else {
            console.log('  (no messages received)');
          }
        });
      }

      console.log('');

      // Check if new servers were created
      fetchTargets().then(targets => {
        const finalCount = targets.targets ? targets.targets.length : 0;
        console.log(`Initial Instant Servers: ${initialServerCount}`);
        console.log(`Final Instant Servers: ${finalCount}`);

        if (finalCount > initialServerCount) {
          console.log(`\n🎉 AUTO-SCALING WORKED! ${finalCount - initialServerCount} new server(s) created`);
        } else {
          console.log(`\n⚠️  No new servers created (auto-scaling may not have triggered)`);
        }

        console.log('');
        clearInterval(targetsInterval);
        ws.close();
        process.exit(0);
      });
    }, 5 * 60 * 1000); // 5 minutes

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
})();
