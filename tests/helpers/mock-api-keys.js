/**
 * @fileoverview Utility functions for generating mock API keys in tests.
 * These mock keys are designed to pass validation but not trigger GitHub secret scanning.
 */

/**
 * Generates a mock API key that passes validation but won't trigger secret scanning.
 * Uses 'sk-' prefix followed by 'MOCK' and additional characters to clearly identify as test data.
 * 
 * @param {string} [suffix=''] - Optional suffix to make the key unique for specific tests
 * @returns {string} A mock API key that passes the sk-[A-Za-z0-9]{20,} validation
 * 
 * @example
 * const mockKey = generateMockApiKey();
 * // Returns: 'sk-MOCK1234567890ABCDEF1234567890'
 * 
 * const uniqueKey = generateMockApiKey('test1');
 * // Returns: 'sk-MOCKtest11234567890ABCDEF1234567890'
 */
export function generateMockApiKey(suffix = '') {
    // Use 'MOCK' prefix to clearly indicate this is test data
    // Add sufficient characters to meet the 20+ character requirement after 'sk-'
    const baseKey = 'MOCK1234567890ABCDEF1234567890';
    
    if (suffix) {
        // Insert suffix after MOCK but ensure total length is sufficient
        const suffixKey = `MOCK${suffix}1234567890ABCDEF1234567890`;
        return `sk-${suffixKey}`;
    }
    
    return `sk-${baseKey}`;
}

/**
 * Generates a mock API key specifically for whitespace testing.
 * This key is designed to be used in tests that verify trimming functionality.
 * 
 * @returns {string} A mock API key suitable for whitespace tests
 */
export function generateMockApiKeyForWhitespaceTests() {
    return generateMockApiKey('TRIM');
}

/**
 * Generates a mock API key for validation tests.
 * This key is designed to pass all validation checks in the Settings class.
 * 
 * @returns {string} A mock API key that passes all validation
 */
export function generateMockApiKeyForValidation() {
    return generateMockApiKey('VALID');
}

/**
 * Generates an invalid mock API key for negative testing.
 * This key is designed to fail validation checks.
 * 
 * @param {string} type - Type of invalid key: 'short', 'no-prefix', 'empty'
 * @returns {string} An invalid mock API key
 */
export function generateInvalidMockApiKey(type = 'short') {
    switch (type) {
        case 'short':
            return 'sk-MOCK123'; // Too short, will fail validation
        case 'no-prefix':
            return 'MOCK1234567890ABCDEF1234567890'; // Missing sk- prefix
        case 'empty':
            return '';
        default:
            return 'sk-MOCK123'; // Default to short
    }
}

/**
 * Generates a mock Azure OpenAI API key.
 * Azure OpenAI API keys are 32-character hexadecimal strings without the sk- prefix.
 * 
 * @returns {string} A mock Azure OpenAI API key that passes validation
 * 
 * @example
 * const azureKey = generateMockAzureApiKey();
 * // Returns: 'abcd1234efgh5678ijkl9012mnop3456'
 */
export function generateMockAzureApiKey() {
    // Generate a 32-character hex string that looks like a real Azure key
    // Using predictable values for testing but still valid format
    return 'abcd1234efab5678cdab9012efab3456';
}

/**
 * Generates a mock Azure OpenAI API key for validation tests.
 * This key is designed to pass Azure OpenAI validation checks.
 * 
 * @returns {string} A mock Azure OpenAI API key that passes validation
 */
export function generateMockAzureApiKeyForValidation() {
    return generateMockAzureApiKey();
}

/**
 * Generates an invalid Azure OpenAI API key for negative testing.
 * 
 * @param {string} type - Type of invalid key: 'short', 'long', 'invalid-chars', 'empty'
 * @returns {string} An invalid Azure OpenAI API key
 */
export function generateInvalidMockAzureApiKey(type = 'short') {
    switch (type) {
        case 'short':
            return 'abcd1234efab5678'; // Too short (16 chars instead of 32)
        case 'long':
            return 'abcd1234efab5678cdab9012efab3456extra'; // Too long (37 chars)
        case 'invalid-chars':
            return 'GHIJ1234KLMN5678OPQR9012STUV3456'; // Contains invalid hex chars (G-V)
        case 'empty':
            return '';
        default:
            return 'abcd1234efab5678'; // Default to short
    }
}