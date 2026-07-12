import js from '@eslint/js';
import globals from 'globals';
import unusedImports from 'eslint-plugin-unused-imports';

const projectRules = {
    'unused-imports/no-unused-imports': 'error',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
};

export default [
    {
        ignores: [
            'node_modules/**',
            'coverage/**',
            'docs/**',
            'metrics/**',
            'playwright-report/**',
            'test-results/**'
        ]
    },
    js.configs.recommended,
    {
        files: ['js/**/*.js'],
        plugins: {
            'unused-imports': unusedImports
        },
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.browser
        },
        rules: projectRules
    },
    {
        files: [
            'tests/**/*.vitest.js',
            'tests/helpers/**/*.js',
            'tests/vitest-setup.js'
        ],
        plugins: {
            'unused-imports': unusedImports
        },
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.vitest
            }
        },
        rules: projectRules
    },
    {
        files: [
            '*.config.js',
            'tests/browser/**/*.{js,mjs}',
            'tests/browser-live/**/*.js',
            'scripts/**/*.mjs'
        ],
        plugins: {
            'unused-imports': unusedImports
        },
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.node
        },
        rules: projectRules
    },
    {
        files: ['tests/browser/**/*.spec.js'],
        languageOptions: {
            globals: {
                self: 'readonly'
            }
        }
    }
];
