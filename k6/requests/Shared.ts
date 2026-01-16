import http, { Response } from 'k6/http';
import { check } from 'k6';
import { AgentConstants, InstantConstants } from '../utils/Constants';

/**
 * K6-compatible class to interact with shared endpoints like agents and instant targets.
 * Handles public S3 endpoints for agent discovery and instant server lists.
 * 
 * Source: Adapted from skipr_k6_tests repository
 */
export class Shared {
    baseUrl: string;

    /**
     * Initializes with base URL from environment configuration.
     * @param baseUrl The base URL for shared S3 resources (e.g., https://skipr-shared-test.s3.us-west-2.amazonaws.com)
     */
    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    /**
     * Gets the /agents.json response containing available VPN agents.
     * @returns k6 Response object.
     */
    getAgentServers(): Response {
        return http.get(`${this.baseUrl}/agents.json`);
    }

    /**
     * Tests the response from the /agents.json endpoint.
     * Checks if the response status is 200 and if agents data is valid.
     *
     * @param agentsRes The response from the /agents.json endpoint.
     * @returns boolean indicating if all checks passed
     */
    testGetAgentServers(agentsRes: Response): boolean {
        const agentsData = agentsRes.json() as {
            valid_from: string;
            agents: Array<{ ip_address: string; status: string }>;
        };
        
        return check(agentsRes, {
            'agents status is 200': (r) => r.status === 200,
            'agents have at least one operational agent': () =>
                agentsData.agents.some((a) => a.status === AgentConstants.STATUS_OPERATIONAL),
            'agents have at least one agent with ip_address': () =>
                agentsData.agents.some((a) => typeof a.ip_address === 'string' && a.ip_address.length > 0),
        });
    }

    /**
     * Gets the /targets_instant.json response containing available instant VPN servers.
     * @returns k6 Response object.
     */
    getInstantServers(): Response {
        return http.get(`${this.baseUrl}/targets_instant.json`);
    }

    /**
     * Tests the response from the /targets_instant.json endpoint.
     * Checks if the response status is 200 and if instant servers data is valid.
     *
     * @param instantsRes The response from the /targets_instant.json endpoint.
     * @returns boolean indicating if all checks passed
     */
    testGetInstantServers(instantsRes: Response): boolean {
        const instantsData = instantsRes.json() as {
            valid_from: string;
            targets: Array<{ ip_address: string; country: string; status: string; type: string }>;
        };
        
        return check(instantsRes, {
            'instants status is 200': (r) => r.status === 200,
            'instants have at least one operational instant target': () =>
                instantsData.targets.some((t) => t.status === InstantConstants.STATUS_OPERATIONAL && t.type === InstantConstants.TYPE_INSTANT),
            'instants have at least one target with ip_address': () =>
                instantsData.targets.some((t) => typeof t.ip_address === 'string' && t.ip_address.length > 0),
            'instants have at least one target with country': () =>
                instantsData.targets.some((t) => typeof t.country === 'string' && t.country.length > 0),
        });
    }

    /**
     * Gets the base URL for further backend requests from the first operational agent.
     * @param agentsRes The response from getAgentServers()
     * @param apiPort The API port to use (default 443)
     * @param fallbackHost Optional fallback host if no operational agent found
     * @returns The base URL as a string (e.g., https://1.2.3.4:443)
     */
    getBaseUrl(agentsRes: Response, apiPort: number = 443, fallbackHost?: string): string {
        const agentsData = agentsRes.json() as {
            valid_from: string;
            agents: Array<{ ip_address: string; status: string }>;
        };
        
        const agentIp = agentsData.agents.find((a) => a.status === AgentConstants.STATUS_OPERATIONAL)?.ip_address;
        
        if (!agentIp) {
            console.warn('No operational agent found in agents.json');
            if (fallbackHost) {
                console.warn(`Using fallback host: ${fallbackHost}`);
                return `${fallbackHost}:${apiPort}`;
            }
            throw new Error('No operational agent found and no fallback host provided');
        }
        
        return `https://${agentIp}:${apiPort}`;
    }
}
