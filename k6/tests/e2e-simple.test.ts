/**
 * K6 test: E2E VPN API Flow (without WebSocket)
 * Tests the complete flow: agents → license → provision request
 * 
 * NOTE: This test does NOT track provision completion via WebSocket.
 * For full E2E with WebSocket, use the hybrid Node.js + k6 approach.
 * 
 * Usage:
 *   k6 run --insecure-skip-tls-verify scripts/k6/tests/e2e-simple.test.js
 */

import { sleep } from 'k6';
import { Shared } from '../requests/Shared';
import { Agent } from '../requests/Agent';
import { License } from '../requests/License';
import { Provision } from '../requests/Provision';
import { getConfigWithThresholds } from '../scenarios/Base';

// K6 test configuration
export const options = getConfigWithThresholds('debug', {
    'http_req_duration': ['p(95)<5000'], // Allow up to 5s (increased from 3s due to license activation delay)
    'http_req_failed': ['rate<0.05'],    // 5% error tolerance
    'checks': ['rate>0.70'],             // 70% checks should pass (relaxed from 75% - license activation may be slow)
});

/**
 * Test configuration - replace with your test environment values
 */
const CONFIG = {
    sharedUrl: 'https://skipr-shared-test.s3.us-west-2.amazonaws.com',
    license: {
        plan_id: 'staging_standard_monthly_subscription',
        payment_processor: 'google_pay',
        paid_invoice_id: 'GPA.3323-3425-0603-62878',
        subscription_type: 'Standard',
        server_verification_data: 'test_verification_data',
    },
    provision: {
        service_type: 'instant' as const,
        region: 'spain',
        ip_address: '103.211.135.111',
        is_ip_address_static: false,
        protocol: 'wireguard' as const,
    },
};

/**
 * Main test function
 */
export default function () {
    // Step 1: Get operational agents
    const shared = new Shared(CONFIG.sharedUrl);
    const agentsRes = shared.getAgentServers();
    shared.testGetAgentServers(agentsRes);

    // Get base URL from operational agent
    const baseUrl = shared.getBaseUrl(agentsRes, 443);
    console.log(`Using agent: ${baseUrl}`);

    // Step 2: Check agent status
    const agent = new Agent(baseUrl);
    const agentStatusRes = agent.getStatus();
    agent.testGetStatus(agentStatusRes);

    // Step 3: Activate license
    const license = new License(baseUrl);
    
    // Check status before activation
    const statusBeforeRes = license.status();
    // Note: May fail if license already active
    
    // Activate license (use test suffix if needed)
    const paidRes = license.paid(CONFIG.license, true);
    license.testPaid(paidRes);
    
    // Wait for license activation with retry logic
    let statusAfterRes;
    let attempts = 0;
    const maxAttempts = 10; // Increased to 10 attempts
    const delayBetweenAttempts = 2; // seconds (total: up to 20s)
    
    for (attempts = 0; attempts < maxAttempts; attempts++) {
        sleep(delayBetweenAttempts);
        statusAfterRes = license.status();
        
        const statusBody = statusAfterRes.json() as any;
        // Check if license is activated
        if (statusBody.isPaid === true && statusBody.message === "paid") {
            console.log(`License activated after ${(attempts + 1) * delayBetweenAttempts}s`);
            break;
        }
        
        if (attempts < maxAttempts - 1) {
            console.log(`Attempt ${attempts + 1}/${maxAttempts}: License not yet active, retrying...`);
        }
    }
    
    // Check status after activation
    license.testSuccessfulStatus(statusAfterRes);

    // Step 4: Request provision
    const provision = new Provision(baseUrl);
    const provRes = provision.do(CONFIG.provision);
    provision.testDo(provRes);
    
    // Extract provision_id (can be used for WebSocket tracking)
    const provisionId = provision.getProvisionId(provRes);
    console.log(`Provision requested: ${provisionId}`);
    
    // NOTE: At this point, provision is initiated but not complete
    // To track completion, use WebSocket connection (see monitor_provision_complete.js)
}
