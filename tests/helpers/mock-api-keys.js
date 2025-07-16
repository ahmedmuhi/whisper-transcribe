/**
 * @fileoverview Utility functions for generating mock API keys in tests.
 * These mock keys are designed to pass validation but not trigger GitHub secret scanning.
 */

/**
 * Generates a mock Azure OpenAI API key that passes validation but won't trigger secret scanning.
 * Azure OpenAI keys are 32 hexadecimal characters (0-9, A-F) with no prefix.
 * 
 * @param {string} [suffix=''] - Optional suffix to make the key unique for specific tests
 * @returns {string} A mock Azure OpenAI API key that passes the ^[A-F0-9]{32}$ validation
 * 
 * @example
 * const mockKey = generateMockApiKey();
 * // Returns: 'AAAABBBBCCCCDDDD1234567890ABCDEF'
 * 
 * const uniqueKey = generateMockApiKey('A1B2');
 * // Returns: 'AAAABBBBCCCCDDDD1234567890ABCDEF' (with A1B2 replacing part of the pattern)
 */
export function generateMockApiKey(suffix = '') {
    // Use repeating patterns with hex characters to clearly indicate this is test data
    // Total must be exactly 32 hex characters for Azure OpenAI format
    const basePattern = 'AAAABBBBCCCCDDDD1234567890ABCDEF';
    
    if (suffix && suffix.length <= 8) {
        // Replace the first part with suffix but ensure we stay at 32 chars and hex only
        const paddedSuffix = suffix.padEnd(8, '0').substring(0, 8).toUpperCase().replace(/[^A-F0-9]/g, 'F');
        return paddedSuffix + basePattern.substring(8);
    }
    
    return basePattern;
}

/**
 * Generates a mock Azure OpenAI API key specifically for whitespace testing.
 * This key is designed to be used in tests that verify trimming functionality.
 * 
 * @returns {string} A mock Azure OpenAI API key suitable for whitespace tests
 */
export function generateMockApiKeyForWhitespaceTests() {
    return generateMockApiKey('TRIM');
}

/**
 * Generates a mock Azure OpenAI API key for validation tests.
 * This key is designed to pass all validation checks in the Settings class.
 * 
 * @returns {string} A mock Azure OpenAI API key that passes all validation
 */
export function generateMockApiKeyForValidation() {
    return generateMockApiKey('TEST');
}

/**
 * Generates an invalid mock API key for negative testing.
 * This key is designed to fail validation checks.
 * 
 * @param {string} type - Type of invalid key: 'short', 'non-hex', 'empty'
 * @returns {string} An invalid mock API key
 */
export function generateInvalidMockApiKey(type = 'short') {
    switch (type) {
        case 'short':
            return 'ABCD1234'; // Too short, will fail validation (only 8 chars instead of 32)
        case 'non-hex':
            return 'GGGGHHHHIIIIJJJJKKKKLLLLMMMMNNN'; // 32 chars but contains non-hex characters
        case 'empty':
            return '';
        case 'with-prefix':
            return 'sk-' + generateMockApiKey(); // Old OpenAI format, should fail Azure validation
        default:
            return 'ABCD1234'; // Default to short
    }
}