/**
 * Constants for Skipr VPN API testing
 * Source: Adapted from skipr_k6_tests repository
 */

export enum AgentConstants {
    APLICATION = 'Skipr Agent',
    STATUS_OK = 'OK',
    STATUS_OPERATIONAL = 'operational',
}

export enum InstantConstants {
    STATUS_OPERATIONAL = 'operational',
    TYPE_INSTANT = 'instant',
    TYPE_ULTIMATE = 'ultimate',
}

export enum CaptainConstants {
    STATUS_OK = 'OK',
}

export enum LicenseConstants {
    SUFIX_TEST = 't104',
    MESSAGE_SUCCESSFUL_PAID = 'Request received. Please wait until license will be granted',
    MESSAGE_SUCCESSFUL_LICENSE_STATUS = 'paid',
    MESSAGE_FAILED_LICENSE_STATUS = 'not paid',
}
