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