/**
 * @fileoverview Compile-time-only authentication double for browser smoke builds.
 */

import { AUTHENTICATION_STATES } from '../../../js/constants.js';
import { APP_EVENTS, eventBus } from '../../../js/event-bus.js';

const BROWSER_TEST_TOKEN = 'deterministic-test-token';

eventBus.setHistoryEnabled(true);
globalThis.__browserTestEventHistoryIsPrivate = () => {
    const visited = new Set();
    const isPrivateValue = (value) => {
        if (value === null || value === undefined) return true;
        if (
            value instanceof Blob
            || value instanceof ArrayBuffer
            || ArrayBuffer.isView(value)
        ) {
            return false;
        }
        if (typeof value === 'string') {
            return !value.startsWith('blob:')
                && !value.includes(BROWSER_TEST_TOKEN)
                && !value.includes('Browser Fixture')
                && !value.includes('browser-fixture@example.invalid')
                && !/^https?:\/\//iu.test(value);
        }
        if (typeof value !== 'object') return true;
        if (visited.has(value)) return true;
        visited.add(value);
        return Object.entries(value).every(([key, entry]) => (
            !/(?:token|target.?uri|identity|account|username)/iu.test(key)
            && isPrivateValue(entry)
        ));
    };
    return eventBus.getHistory().every(({ data }) => isPrivateValue(data));
};

class FakeAuthenticationService {
    constructor() {
        this.state = AUTHENTICATION_STATES.UNINITIALIZED;
        this.scenario = sessionStorage.getItem('browser_test_auth_scenario') || 'ready';
    }

    async initialize() {
        this.#setState(AUTHENTICATION_STATES.INITIALIZING);
        if (this.scenario === 'signed-out') {
            await new Promise((resolve) => setTimeout(resolve, 350));
            return this.#setState(AUTHENTICATION_STATES.SIGNED_OUT);
        }
        if (this.scenario === 'interaction-required') {
            return this.#setState(AUTHENTICATION_STATES.INTERACTION_REQUIRED);
        }
        return this.#setState(AUTHENTICATION_STATES.READY);
    }

    getState() {
        return this.state;
    }

    getAccountPresentation() {
        if (this.state !== AUTHENTICATION_STATES.READY) return null;
        return Object.freeze({
            name: 'Browser Fixture',
            username: 'browser-fixture@example.invalid'
        });
    }

    async ensureTokenReady() {
        return this.state;
    }

    async getAccessToken() {
        return BROWSER_TEST_TOKEN;
    }

    async signInRedirect() {
        return this.#setState(AUTHENTICATION_STATES.READY);
    }

    async acquireTokenRedirect() {
        return this.#setState(AUTHENTICATION_STATES.READY);
    }

    async signOutRedirect() {
        return this.#setState(AUTHENTICATION_STATES.SIGNED_OUT);
    }

    #setState(state) {
        this.state = state;
        eventBus.emit(APP_EVENTS.AUTHENTICATION_STATE_CHANGED, { state });
        return state;
    }
}

export { FakeAuthenticationService as AuthenticationService };
