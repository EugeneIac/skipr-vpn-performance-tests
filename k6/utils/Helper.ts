import crypto from 'k6/crypto';
import nacl from 'tweetnacl';

/**
 * Helper utilities for Ed25519 signing, key generation, and cryptographic operations
 * Used for k6 performance testing of Skipr VPN API
 * 
 * Source: Adapted from skipr_k6_tests repository
 */
export class Helper {
    /**
     * Generates a key pair for the device.
     * @returns {Array<string>} An array containing the public and secret keys [publicKey, secretKey]
     */
    generateKeyPair(): [string, string] {
        const seed = new Uint8Array(crypto.randomBytes(32)); // 32 bytes random seed
        const keyPair = nacl.sign.keyPair.fromSeed(seed);

        const publicKeyHex = this.uint8ArrayToHex(keyPair.publicKey);
        const secretKeyHex = this.uint8ArrayToHex(seed); // Only 32 bytes seed, tweetnacl derives privateKey internally
        return [publicKeyHex, secretKeyHex];
    }

    /**
     * Converts a hexadecimal string to a Uint8Array.
     * This is a necessary utility as k6 does not provide a built-in hex conversion.
     * @param hexString - A string of hexadecimal characters.
     * @returns A Uint8Array representation of the input hexadecimal string.
     * @throws {Error} If the hex string has an odd length.
     */
    hexToUint8Array(hexString: string): Uint8Array {
        if (hexString.length % 2 !== 0) {
            throw new Error("Hex string must have an even length.");
        }
        const bytes = new Uint8Array(hexString.length / 2);
        for (let i = 0, j = 0; i < hexString.length; i += 2, j++) {
            bytes[j] = parseInt(hexString.substring(i, i + 2), 16);
        }
        return bytes;
    }

    /**
     * Encodes a Uint8Array to a Base64 string.
     * @param bytes - The Uint8Array to encode.
     * @returns A Base64 encoded string.
     */
    encodeBase64(bytes: Uint8Array): string {
        const base64abc = [
            "A", "B", "C", "D", "E", "F", "G", "H",
            "I", "J", "K", "L", "M", "N", "O", "P",
            "Q", "R", "S", "T", "U", "V", "W", "X",
            "Y", "Z", "a", "b", "c", "d", "e", "f",
            "g", "h", "i", "j", "k", "l", "m", "n",
            "o", "p", "q", "r", "s", "t", "u", "v",
            "w", "x", "y", "z", "0", "1", "2", "3",
            "4", "5", "6", "7", "8", "9", "+", "/"
        ];

        let result = "", i, l = bytes.length;
        for (i = 2; i < l; i += 3) {
            result += base64abc[bytes[i - 2] >> 2];
            result += base64abc[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)];
            result += base64abc[((bytes[i - 1] & 0x0f) << 2) | (bytes[i] >> 6)];
            result += base64abc[bytes[i] & 0x3f];
        }

        if (i === l + 1) { // 1 leftover byte
            result += base64abc[bytes[i - 2] >> 2];
            result += base64abc[(bytes[i - 2] & 0x03) << 4];
            result += "==";
        } else if (i === l) { // 2 leftover bytes
            result += base64abc[bytes[i - 2] >> 2];
            result += base64abc[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)];
            result += base64abc[(bytes[i - 1] & 0x0f) << 2];
            result += "=";
        }
        return result;
    }

    /**
     * Decodes a UTF-8 string to a Uint8Array.
     * @param str - The UTF-8 string to decode.
     * @returns A Uint8Array representation of the input string.
     */
    decodeUTF8(str: string): Uint8Array {
        const utf8 = unescape(encodeURIComponent(str));
        const arr = new Uint8Array(utf8.length);
        for (let i = 0; i < utf8.length; i++) {
            arr[i] = utf8.charCodeAt(i);
        }
        return arr;
    }

    /**
     * Generates an Ed25519 signature for a given message using the secret key and public key.
     * This signature is used in X-Signature header for API authentication.
     * 
     * @param message - The message to sign (usually JSON stringified request body).
     * @param secretKeyHex - The secret key in hexadecimal format.
     * @param publicKeyHex - The public key in hexadecimal format.
     * @returns A Base64 encoded signature.
     */
    generateEd25519Signature(
        message: string,
        secretKeyHex: string,
        publicKeyHex: string
    ): string {
        // Remove test suffix if present (hack from original code)
        const trimmedPub = publicKeyHex.endsWith('t104')
            ? publicKeyHex.slice(0, 64)
            : publicKeyHex;

        const seedBytes = this.hexToUint8Array(secretKeyHex.slice(0, 64));
        const pubBytes = this.hexToUint8Array(trimmedPub);

        if (seedBytes.length !== 32 || pubBytes.length !== 32) {
            throw new Error('Invalid key lengths');
        }

        const keyPair = nacl.sign.keyPair.fromSeed(seedBytes);
        const msgBytes = this.decodeUTF8(JSON.stringify(JSON.parse(message)));

        const sig = nacl.sign.detached(msgBytes, keyPair.secretKey);

        return this.encodeBase64(sig);
    }

    /**
     * Converts a Uint8Array to a hexadecimal string.
     * This is a necessary utility as k6 does not provide a built-in hex conversion.
     * @param uint8Array - The Uint8Array to convert.
     * @returns A hexadecimal string.
     */
    uint8ArrayToHex(uint8Array: Uint8Array): string {
        return Array.from(uint8Array)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Generates a random device ID consisting of a random hex string.
     * @returns {string} Randomly generated device ID (40 hex characters)
     */
    generateDeviceId(): string {
        const bytes = crypto.randomBytes(20); // Returns an ArrayBuffer
        const device_id = this.uint8ArrayToHex(new Uint8Array(bytes));
        return device_id;
    }
}
