/**
 * @fileoverview Compile-time-only authentication double for browser smoke builds.
 */

import { AUTHENTICATION_STATES } from '../../../js/constants.js';

const BROWSER_TEST_TOKEN = 'deterministic-test-token';

class FakeAuthenticationService {
    async initialize() {
        return AUTHENTICATION_STATES.READY;
    }

    getState() {
        return AUTHENTICATION_STATES.READY;
    }

    getAccountPresentation() {
        return Object.freeze({ name: 'Fake User', username: 'fake-user@example.invalid' });
    }

    async ensureTokenReady() {
        return AUTHENTICATION_STATES.READY;
    }

    async getAccessToken() {
        return BROWSER_TEST_TOKEN;
    }

    async signInRedirect() {
        return AUTHENTICATION_STATES.READY;
    }

    async acquireTokenRedirect() {
        return AUTHENTICATION_STATES.READY;
    }

    async signOutRedirect() {
        return AUTHENTICATION_STATES.SIGNED_OUT;
    }
}

export { FakeAuthenticationService as AuthenticationService };
