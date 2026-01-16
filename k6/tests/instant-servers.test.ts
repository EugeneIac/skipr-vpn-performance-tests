/**
 * K6 test: Instant Servers Availability Check
 * Tests the /targets_instant.json endpoint for operational instant servers
 * 
 * Usage:
 *   k6 run --insecure-skip-tls-verify scripts/k6/tests/instant-servers.test.js
 */

import { Shared } from '../requests/Shared';
import { getConfigWithThresholds } from '../scenarios/Base';

// K6 test configuration - can be overridden by command line
export const options = getConfigWithThresholds('debug', {
    'http_req_duration': ['p(95)<1000'], // Instant servers should respond quickly
    'http_req_failed': ['rate<0.01'],
    'checks': ['rate>0.95'], // At least 95% of checks should pass
});

/**
 * Main test function - executed by each VU
 */
export default function () {
    // Use test environment shared endpoint
    const shared = new Shared('https://skipr-shared-test.s3.us-west-2.amazonaws.com');
    
    // Get instant servers list
    const instantsRes = shared.getInstantServers();
    
    // Validate response
    shared.testGetInstantServers(instantsRes);
}
