import http, { Response } from 'k6/http';
import { check } from 'k6';
import { AgentConstants, CaptainConstants } from '../utils/Constants';

/**
 * Class to interact with a specific VPN agent by its IP address.
 * Handles agent status checks and health monitoring.
 * 
 * Source: Adapted from skipr_k6_tests repository
 */
export class Agent {
    baseUrl: string;

    /**
     * Initializes the Agent class with a base URL
     * @param baseUrl The base URL for the agent (e.g., https://1.2.3.4:443)
     */
    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    /**
     * Performs a GET request to the agent's /status endpoint.
     * @returns k6 Response object
     */
    getStatus(): Response {
        return http.get(`${this.baseUrl}/status`);
    }

    /**
     * Tests the agent's status response.
     * Validates application name, status, captain status, version, and available destinations.
     * 
     * @param agentRes The response from the agent's status endpoint.
     * @returns boolean indicating if all checks passed
     */
    testGetStatus(agentRes: Response): boolean {
        const agentData = agentRes.json() as {
            application: string;
            status: string;
            captain_status: string;
            version: string;
            available_service_destinations: {
                instant?: string[];
                ultimate?: string[];
            };
        };
        
        return check(agentRes, {
            'agent status is 200': (r) => r.status === 200,
            'agent application is Skipr Agent': () => agentData.application === AgentConstants.APLICATION,
            'agent status is OK': () => agentData.status === AgentConstants.STATUS_OK,
            'agent captain_status is OK': () => agentData.captain_status === CaptainConstants.STATUS_OK,
            'agent has version string': () => typeof agentData.version === 'string' && agentData.version.length > 0,
            'agent instant destinations is array': () =>
                Array.isArray(agentData.available_service_destinations?.instant),
        });
    }
}
