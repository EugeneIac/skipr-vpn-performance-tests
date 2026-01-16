/**
 * Configuration interface for k6 tests
 * Adapted from skipr_k6_tests repository
 */

export interface K6Config {
    environment: 'test' | 'dev' | 'staging' | 'prod';
    scenario: 'debug' | 'load' | 'stress' | 'performance';
    domains: {
        [key: string]: {
            host: string;
            api_port: number;
            ws_port: number;
            provision: {
                service_type: 'instant' | 'ultimate';
                region: string;
                ip_address: string;
                is_ip_address_static: boolean;
                protocol: 'openvpn' | 'wireguard';
            };
            license: {
                plan_id: string;
                payment_processor: string;
                paid_invoice_id: string;
                subscription_type: string;
                server_verification_data: string;
            };
            shared: {
                host: string;
            };
            cms?: {
                host: string;
            };
            timeoutSec: number;
            timeoutWSSec: number;
        };
    };
}
