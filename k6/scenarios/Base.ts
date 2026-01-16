/**
 * K6 scenario configurations for different testing modes
 * Source: Adapted from skipr_k6_tests repository
 */

const BASE_CONFIG = {
    // TLS verification skipped via CLI flag: --insecure-skip-tls-verify
};

/**
 * Predefined k6 test scenarios for different performance testing goals
 */
export const SCENARIOS = {
    /**
     * Debug mode: Single VU, single iteration
     * Use for: Quick test validation, debugging
     */
    debug: {
        executor: 'shared-iterations',
        vus: 1,
        iterations: 1,
        maxDuration: '30s',
    },

    /**
     * Load test: Gradually ramp up VUs to find system limits
     * Use for: Finding maximum capacity, baseline performance
     */
    load: {
        executor: 'ramping-vus',
        startVUs: 1,
        stages: [
            { duration: '30s', target: 50 },  // Ramp up to 50 VUs
            { duration: '1m', target: 75 },   // Increase to 75 VUs
            { duration: '30s', target: 0 },   // Ramp down
        ],
        gracefulRampDown: '5s',
    },

    /**
     * Stress test: Push system beyond normal capacity
     * Use for: Finding breaking points, stability testing
     */
    stress: {
        executor: 'ramping-arrival-rate',
        startRate: 10,
        timeUnit: '1s',
        preAllocatedVUs: 50,
        maxVUs: 100,
        stages: [
            { target: 50, duration: '3m' },   // Ramp to 50 req/s
            { target: 100, duration: '6m' },  // Push to 100 req/s
        ],
    },

    /**
     * Performance test: Steady load over extended period
     * Use for: Sustained load testing, memory leak detection
     */
    performance: {
        executor: 'constant-vus',
        vus: 25,
        duration: '10m',
    },

    /**
     * Spike test: Sudden load increase
     * Use for: Testing autoscaling, burst capacity
     */
    spike: {
        executor: 'ramping-vus',
        startVUs: 1,
        stages: [
            { duration: '10s', target: 1 },    // Baseline
            { duration: '10s', target: 100 },  // Spike!
            { duration: '1m', target: 100 },   // Sustain
            { duration: '10s', target: 1 },    // Recovery
        ],
        gracefulRampDown: '5s',
    },
};

/**
 * Get k6 options configuration for a specific scenario
 * @param scenarioName The scenario to use (debug, load, stress, performance, spike)
 * @returns k6 options object
 */
export function getConfig(scenarioName: keyof typeof SCENARIOS = 'debug') {
    return {
        ...BASE_CONFIG,
        scenarios: {
            main: SCENARIOS[scenarioName],
        },
    };
}

/**
 * Get k6 options with custom thresholds for critical metrics
 * @param scenarioName The scenario to use
 * @param thresholds Custom thresholds (optional)
 * @returns k6 options object with thresholds
 */
export function getConfigWithThresholds(
    scenarioName: keyof typeof SCENARIOS = 'debug',
    thresholds?: Record<string, string[]>
) {
    const defaultThresholds = {
        'http_req_duration': ['p(95)<2000'], // 95% of requests should be below 2s
        'http_req_failed': ['rate<0.01'],    // Error rate should be below 1%
        'checks': ['rate>0.99'],             // 99% of checks should pass
    };

    return {
        ...BASE_CONFIG,
        scenarios: {
            main: SCENARIOS[scenarioName],
        },
        thresholds: thresholds || defaultThresholds,
    };
}
