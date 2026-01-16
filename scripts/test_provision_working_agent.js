// Test provision request to working agent (15.206.79.110)
// Using correct credentials from Postman

const https = require('https');
const http = require('http');

// Credentials from Postman
const AGENT = 'https://15.206.79.110:443';
const SIGNING_SERVICE = 'http://18.153.81.95:3000';
const DEVICE_ID = 'c7a91f9aa35dae4eef1f73f8fb39fffe4f62a2e1';
const PUBLIC_KEY = '77e0e65fd0edba020b29dbc8bfda1ebde8aa5d6ead38339a86a2e49ea9157e0e';
const PRIVATE_KEY = '33dd5cfd940c06605feb76a616756961f6a6535a962d1f78b0a3745801273836';

console.log('========================================');
console.log('Direct Provision Test');
console.log('========================================');
console.log('Agent:', AGENT);
console.log('Device ID:', DEVICE_ID);
console.log('');

// Test both protocols
async function testProvision(protocol) {
  console.log(`\n--- Testing with ${protocol.toUpperCase()} protocol ---\n`);

  const provisionPayload = {
    ip_address: '83.5.133.110',
    is_ip_address_static: false,
    region: 'switzerland',
    service_type: 'instant',
    public_key: PUBLIC_KEY,
    device_id: DEVICE_ID,
    protocol: protocol
  };

  console.log('Step 1: Generating signature...');

  // Get signature from signing service
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

  console.log('✓ Signature generated:', signature.substring(0, 20) + '...');
  console.log('');

  console.log('Step 2: Sending provision request...');

  // Send provision request
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
          headers: res.headers,
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

  console.log('HTTP Status:', response.statusCode);
  console.log('Response Body:', response.body);
  console.log('');

  if (response.statusCode === 200 || response.statusCode === 201) {
    console.log('✅ Provision request SUCCESSFUL with', protocol.toUpperCase());
    try {
      const data = JSON.parse(response.body);
      if (data.provision_id) {
        console.log('📋 Provision ID:', data.provision_id);
      }
    } catch (e) {
      // Ignore parse errors
    }
  } else {
    console.log('❌ Provision request FAILED with', protocol.toUpperCase());
  }

  return response;
}

// Run tests
(async () => {
  try {
    // Test OpenVPN first
    await testProvision('openvpn');

    // Test WireGuard
    await testProvision('wireguard');

    console.log('\n========================================');
    console.log('Test Complete');
    console.log('========================================');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
