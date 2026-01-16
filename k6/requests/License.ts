import http, { Response } from 'k6/http';
import { check } from 'k6';
import { Helper } from '../utils/Helper';
import { LicenseConstants } from '../utils/Constants';

/**
 * Class responsible for license activation and status checking
 * using signed Ed25519 requests to the backend.
 * 
 * Source: Adapted from skipr_k6_tests repository
 */
export class License {
    private readonly helper: Helper;
    baseUrl: string;

    public device_id: string;
    public public_key: string;
    public secret_key: string;

    /**
     * Initializes license handler with key generation
     * @param baseUrl The base URL for the agent (e.g., https://1.2.3.4:443)
     */
    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
        this.helper = new Helper();
        
        const [pub, priv] = this.helper.generateKeyPair();
        this.public_key = pub;
        this.secret_key = priv;
        this.device_id = this.helper.generateDeviceId();
    }

    /**
     * Activates the license by sending a signed POST request to /license/paid
     * @param config License configuration with plan details
     * @param useTestSuffix Whether to append test suffix to public key (default: false)
     * @returns k6 Response object
     */
    paid(config: {
        plan_id: string;
        payment_processor: string;
        paid_invoice_id: string;
        subscription_type: string;
        server_verification_data: string;
    }, useTestSuffix: boolean = false): Response {
        // Optional test suffix (remove in production)
        const publicKeyToSend = useTestSuffix 
            ? this.public_key + LicenseConstants.SUFIX_TEST 
            : this.public_key;

        const payload = JSON.stringify({
            device_id: this.device_id,
            public_key: publicKeyToSend,
            paid_invoice_id: config.paid_invoice_id,
            payment_processor: config.payment_processor,
            subscription_type: config.subscription_type,
            plan_id: config.plan_id,
            server_verification_data: config.server_verification_data
        });

        const signature = this.helper.generateEd25519Signature(payload, this.secret_key, this.public_key);

        const headers = {
            'Content-Type': 'application/json',
            'X-Signature': signature
        };

        return http.post(`${this.baseUrl}/license/paid`, payload, { headers });
    }

    /**
     * Tests the license paid response.
     * Checks if the response status is 201 and if the message is correct.
     *
     * @param paidRes The response from the /license/paid endpoint.
     * @returns boolean indicating if all checks passed
     */
    testPaid(paidRes: Response): boolean {
        const paidBody = paidRes.json() as { message: string };
        return check(paidRes, {
            'paid request returned 201': (r) => r.status === 201,
            'paid message is "Request received. Please wait until license will be granted"': () =>
                paidBody.message === LicenseConstants.MESSAGE_SUCCESSFUL_PAID,
        });
    }

    /**
     * Fetches license status by sending a signed GET request to /license/status
     * @returns k6 Response object
     */
    status(): Response {
        const query = `device_id=${this.device_id}&public_key=${this.public_key}`;
        const message = JSON.stringify({
            device_id: this.device_id,
            public_key: this.public_key
        });

        const signature = this.helper.generateEd25519Signature(message, this.secret_key, this.public_key);

        const headers = {
            'X-Signature': signature
        };

        return http.get(`${this.baseUrl}/license/status?${query}`, { headers });
    }

    /**
     * Tests the license status response after payment.
     * Checks if the response status is 200 and if the license is paid.
     *
     * @param statusRes The response from the /license/status endpoint.
     * @returns boolean indicating if all checks passed
     */
    testSuccessfulStatus(statusRes: Response): boolean {
        const statusBody = statusRes.json() as { 
            message: string; 
            isPaid: boolean; 
            expire_date: number | null; 
            plan_id: string | null 
        };
        
        return check(statusRes, {
            'status after paid is 200': (r) => r.status === 200,
            'status after paid message is "paid"': () => statusBody.message === LicenseConstants.MESSAGE_SUCCESSFUL_LICENSE_STATUS,
            'status after paid isPaid true': () => statusBody.isPaid === true,
            'status after paid expire_date is number': () => typeof statusBody.expire_date === 'number',
            'status after paid plan_id is string': () => typeof statusBody.plan_id === 'string'
        });
    }

    /**
     * Tests the license status response before payment.
     * Checks if the response status is 200 and if the license is not paid.
     *
     * @param statusRes The response from the /license/status endpoint.
     * @returns boolean indicating if all checks passed
     */
    testUnsuccessfulStatus(statusRes: Response): boolean {
        const statusBody = statusRes.json() as { 
            message: string; 
            isPaid: boolean; 
            expire_date: number | null; 
            plan_id: string | null 
        };
        
        return check(statusRes, {
            'status before paid is 200': (r) => r.status === 200,
            'status before paid message is "not paid"': () => statusBody.message === LicenseConstants.MESSAGE_FAILED_LICENSE_STATUS,
            'status before paid isPaid false': () => statusBody.isPaid === false,
            'status before paid expire_date is null': () => statusBody.expire_date === null,
            'status before paid plan_id is null': () => statusBody.plan_id === null,
        });
    }
}
