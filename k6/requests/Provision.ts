import http, { Response } from 'k6/http';
import { check } from 'k6';
import { Helper } from '../utils/Helper';

/**
 * Class responsible for provisioning VPN devices by sending signed requests
 * to the backend using environment configuration.
 * 
 * NOTE: This class handles the initial provision request only.
 * For WebSocket-based provision status tracking, use separate Node.js script.
 * 
 * Source: Adapted from skipr_k6_tests repository
 */
export class Provision {
    private readonly helper: Helper;
    baseUrl: string;

    public device_id: string;
    public public_key: string;
    public secret_key: string;

    /**
     * Initializes configuration and generates deviceId + key pair
     * @param baseUrl The base URL for the agent (e.g., https://1.2.3.4:443)
     */
    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
        this.helper = new Helper();
        
        this.device_id = this.helper.generateDeviceId();
        const [pub, priv] = this.helper.generateKeyPair();
        this.public_key = pub;
        this.secret_key = priv;
    }

    /**
     * Sends a POST request to the /provision/do endpoint using k6 http client,
     * signs the body using Ed25519 and attaches signature headers.
     *
     * @param config Provision configuration
     * @returns {Response} k6 HTTP response containing provision_id
     */
    do(config: {
        service_type: 'instant' | 'ultimate';
        region: string;
        ip_address: string;
        is_ip_address_static: boolean;
        protocol: 'openvpn' | 'wireguard';
    }): Response {
        const payload = JSON.stringify({
            ip_address: config.ip_address,
            is_ip_address_static: config.is_ip_address_static,
            region: config.region,
            service_type: config.service_type,
            public_key: this.public_key,
            device_id: this.device_id,
            protocol: config.protocol,
        });

        const signature = this.helper.generateEd25519Signature(payload, this.secret_key, this.public_key);

        const headers = {
            'Content-Type': 'application/json',
            'X-Signature': signature
        };

        return http.post(`${this.baseUrl}/provision/do`, payload, { headers });
    }

    /**
     * Tests the response from the /provision/do endpoint.
     * Checks if the response status is 201 and if the provision_id is a valid string.
     *
     * @param provRes The response from the /provision/do endpoint.
     * @returns boolean indicating if all checks passed
     */
    testDo(provRes: Response): boolean {
        const provBody = provRes.json() as { message: string; provision_id: string };
        return check(provRes, {
            'provision status is 201': (r) => r.status === 201,
            'provision provision_id is valid string': () =>
                typeof provBody.provision_id === 'string' && provBody.provision_id.length > 0,
        });
    }

    /**
     * Extracts provision_id from the response for use in WebSocket tracking
     * @param provRes The response from the /provision/do endpoint
     * @returns provision_id string or null if not found
     */
    getProvisionId(provRes: Response): string | null {
        const provBody = provRes.json() as { provision_id?: string };
        return provBody.provision_id || null;
    }
}
