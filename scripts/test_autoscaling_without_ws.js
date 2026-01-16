// Auto-scaling test WITHOUT WebSocket
// Send multiple provision requests and monitor targets_instant.json for new servers

const https = require('https');
const http = require('http');

const AGENT = 'https://15.206.79.110:443';
const SIGNING_SERVICE = 'http://18.153.81.95:3000';
const S3_TARGETS = 'https://skipr-shared-test.s3.us-west-2.amazonaws.com/targets_instant.json';

const DEVICE_ID = 'c7a91f9aa35dae4eef1f73f8fb39fffe4f62a2e1';
const PUBLIC_KEY = '77e0e65fd0edba020b29dbc8bfda1ebde8aa5d6ead38339a86a2e49ea9157e0e';
const PRIVATE_KEY = '33dd5cfd940c06605feb76a616756961f6a6535a962d1f78b0a3745801273836';

// Test configuration
const NUM_CLIENTS = 7; // Above threshold (5) to trigger auto-scaling
const MONITOR_DURATION = 3 * 60 * 1000; // 3 minutes
const CHECK_INTERVAL = 15 * 1000; // Check every 15 seconds

let initialServerCount = 0;
let provisionsSent = 0;
let provisionsSucceeded = 0;

console.log('========================================');
console.log('Auto-Scaling Test (Without WebSocket)');
console.log('========================================');
console.log(`Agent: ${AGENT}`);
console.log(`Number of Clients: ${NUM_CLIENTS}`);
console.log(`Threshold: 5 clients per server`);
console.log(`Monitor Duration: 3 minutes`);
console.log('');
console.log('Strategy:');
console.log('  1. Send multiple provision requests (>5)');
console.log('  2. Monitor targets_instant.json for new servers');
console.log('  3. Check if auto-scaling creates new Instant server');
console.log('');

// Fetch targets
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

// Send provision request
async function sendProvision(clientNum, protocol) {
  const provisionPayload = {
    ip_address: '83.5.133.110',
    is_ip_address_static: false,
    region: 'switzerland',
    service_type: 'instant',
    public_key: PUBLIC_KEY,
    device_id: `${DEVICE_ID}_client${clientNum}`,
    protocol: protocol
  };

  // Get signature
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
      },
      timeout: 10000
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
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Signing timeout'));
    });
    req.write(signPayload);
    req.end();
  });

  // Send provision
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
      rejectUnauthorized: false,
      timeout: 10000
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
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Provision timeout'));
    });
    req.write(provisionBody);
    req.end();
  });

  provisionsSent++;

  if (response.statusCode === 200 || response.statusCode === 201) {
    provisionsSucceeded++;
    const data = JSON.parse(response.body);
    return { success: true, provisionId: data.provision_id };
  } else {
    return { success: false, error: response.body };
  }
}

// Monitor targets
function startMonitoring() {
  console.log('--- Starting targets_instant.json monitor ---');
  console.log(`Checking every ${CHECK_INTERVAL / 1000} seconds`);
  console.log('');

  let checkCount = 0;

  const interval = setInterval(async () => {
    checkCount++;
    const timestamp = new Date().toTimeString().split(' ')[0];

    try {
      const targets = await fetchTargets();
      const currentCount = targets.targets ? targets.targets.length : 0;

      if (currentCount > initialServerCount) {
        const newCount = currentCount - initialServerCount;
        console.log(`\n🎉🎉🎉 [${timestamp}] AUTO-SCALING DETECTED! 🎉🎉🎉`);
        console.log(`New Instant Servers Created: ${newCount}`);
        console.log(`Total Instant Servers: ${currentCount}`);
        console.log('');
        console.log('All servers:');

        targets.targets.forEach((server, idx) => {
          console.log(`  ${idx + 1}. ${server.country} (${server.region}): ${server.ip_address} [${server.status}]`);
        });
        console.log('');

        initialServerCount = currentCount;
      } else {
        console.log(`[${timestamp}] Check #${checkCount}: ${currentCount} servers (no change)`);
      }
    } catch (error) {
      console.error(`[${timestamp}] Error fetching targets:`, error.message);
    }
  }, CHECK_INTERVAL);

  return interval;
}

// Main
(async () => {
  try {
    // Step 1: Get initial count
    console.log('Step 1: Getting initial server count...');
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
    console.log(`Step 2: Sending ${NUM_CLIENTS} provision requests...`);
    console.log('');

    const startTime = Date.now();

    for (let i = 1; i <= NUM_CLIENTS; i++) {
      const protocol = i % 2 === 0 ? 'wireguard' : 'openvpn';
      const clientLabel = `Client ${i} [${protocol}]`;

      try {
        console.log(`${clientLabel}: Sending provision request...`);
        const result = await sendProvision(i, protocol);

        if (result.success) {
          console.log(`${clientLabel}: ✅ Success - ${result.provisionId}`);
        } else {
          console.log(`${clientLabel}: ❌ Failed - ${result.error}`);
        }
      } catch (error) {
        console.log(`${clientLabel}: ❌ Error - ${error.message}`);
      }

      // Small delay between requests
      if (i < NUM_CLIENTS) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('');
    console.log(`✅ Finished sending provisions in ${elapsedTime}s`);
    console.log(`Success Rate: ${provisionsSucceeded}/${provisionsSent} (${Math.round(provisionsSucceeded / provisionsSent * 100)}%)`);
    console.log('');

    if (provisionsSucceeded === 0) {
      console.log('❌ No provisions succeeded. Cannot test auto-scaling.');
      process.exit(1);
    }

    // Step 3: Monitor for changes
    console.log('Step 3: Monitoring for new Instant servers...');
    console.log('');

    const monitorInterval = startMonitoring();

    // Wait for monitoring duration
    setTimeout(async () => {
      clearInterval(monitorInterval);

      console.log('\n========================================');
      console.log('Monitoring Complete');
      console.log('========================================');
      console.log('');

      // Final check
      const finalTargets = await fetchTargets();
      const finalCount = finalTargets.targets ? finalTargets.targets.length : 0;

      console.log('📊 Final Results:');
      console.log(`Initial Servers: ${initialServerCount}`);
      console.log(`Final Servers: ${finalCount}`);
      console.log(`Provision Requests Sent: ${provisionsSent}`);
      console.log(`Provision Requests Succeeded: ${provisionsSucceeded}`);
      console.log('');

      if (finalCount > initialServerCount) {
        console.log(`🎉 AUTO-SCALING WORKED! ${finalCount - initialServerCount} new server(s) created`);
        console.log('');
        console.log('This confirms:');
        console.log('  ✅ Auto-scaling threshold detection is working');
        console.log('  ✅ Terraform provisioning is working');
        console.log('  ✅ S3 metadata updates are working');
      } else {
        console.log('⚠️  No new servers were created');
        console.log('');
        console.log('Possible reasons:');
        console.log('  - Threshold not reached (need 6+ active clients per server)');
        console.log('  - Auto-scaling is disabled in TEST environment');
        console.log('  - Existing Instant servers are down (no baseline capacity)');
        console.log('  - Provision requests accepted but not processed');
        console.log('  - Longer wait time needed (>3 minutes)');
      }

      console.log('');
      process.exit(0);
    }, MONITOR_DURATION);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
})();
