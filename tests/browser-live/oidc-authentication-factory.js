/**
 * @fileoverview Compile-time-only authentication bridge for the protected live build.
 */

import { AUTHENTICATION_STATES } from '../../js/constants.js';
import { APP_EVENTS, eventBus } from '../../js/event-bus.js';

const ACCESS_TOKEN_BINDING = '__liveContractGetAccessToken';

class OidcAuthenticationService {
    constructor() {
        this.state = AUTHENTICATION_STATES.UNINITIALIZED;
    }

    async initialize() {
        this.#setState(AUTHENTICATION_STATES.INITIALIZING);
        return this.#setState(AUTHENTICATION_STATES.READY);
    }

    getState() {
        return this.state;
    }

    getAccountPresentation() {
        return null;
    }

    async ensureTokenReady() {
        return this.state;
    }

    async getAccessToken(scope) {
        if (typeof scope !== 'string' || !scope.trim()) {
            throw new Error('The live contract requested an invalid resource scope.');
        }
        const requestAccessToken = globalThis[ACCESS_TOKEN_BINDING];
        if (typeof requestAccessToken !== 'function') {
            throw new Error('The protected workload token bridge is unavailable.');
        }
        const accessToken = await requestAccessToken();
        if (typeof accessToken !== 'string' || !accessToken) {
            throw new Error('The protected workload token is unavailable.');
        }
        return accessToken;
    }

    async signInRedirect() {
        throw new Error('Interactive sign-in is unavailable in the live contract.');
    }

    async acquireTokenRedirect() {
        throw new Error('Interactive token acquisition is unavailable in the live contract.');
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

export { OidcAuthenticationService as AuthenticationService };
