/**
 * @fileoverview Sole owner of the Microsoft Entra MSAL runtime boundary.
 */

import {
    InteractionRequiredAuthError,
    PublicClientApplication
} from '@azure/msal-browser';
import { createAuthenticationConfig, AUTHENTICATION_ERROR_CODES } from './authentication-config.js';
import { AUTHENTICATION_STATES, MESSAGES } from './constants.js';
import { eventBus, APP_EVENTS } from './event-bus.js';

const NETWORK_ERROR_CODES = new Set([
    'no_network_connectivity',
    'get_request_failed',
    'post_request_failed'
]);

function accountSortKey(account) {
    return account?.homeAccountId || account?.username || '';
}

export class AuthenticationService {
    #configuration;
    #client;
    #initializePromise = null;
    #state = AUTHENTICATION_STATES.UNINITIALIZED;

    constructor(configuration = null, clientApplication = null) {
        this.#configuration = configuration;
        this.#client = clientApplication;
    }

    initialize() {
        if (!this.#initializePromise) {
            this.#initializePromise = this.#initialize();
        }
        return this.#initializePromise;
    }

    getState() {
        return this.#state;
    }

    getAccountPresentation() {
        const account = this.#client?.getActiveAccount() || null;
        if (!account) return null;
        return Object.freeze({
            name: typeof account.name === 'string' ? account.name : '',
            username: typeof account.username === 'string' ? account.username : ''
        });
    }

    async ensureTokenReady(scope) {
        if (this.#state !== AUTHENTICATION_STATES.READY) return this.#state;
        const account = this.#client.getActiveAccount();
        if (!account) return this.#setState(AUTHENTICATION_STATES.SIGNED_OUT);

        try {
            const authenticationResult = await this.#client.acquireTokenSilent(
                this.#createTokenRequest(scope, account)
            );
            if (!authenticationResult?.accessToken) {
                return this.#setState(AUTHENTICATION_STATES.AUTHENTICATION_ERROR);
            }
            return AUTHENTICATION_STATES.READY;
        } catch (error) {
            return this.#setState(this.#categorizeError(error));
        }
    }

    async getAccessToken(scope) {
        if (this.#state !== AUTHENTICATION_STATES.READY) {
            throw this.#createSafeTokenError(this.#state);
        }
        const account = this.#client.getActiveAccount();
        if (!account) {
            throw this.#createSafeTokenError(
                this.#setState(AUTHENTICATION_STATES.SIGNED_OUT)
            );
        }

        try {
            const authenticationResult = await this.#client.acquireTokenSilent(
                this.#createTokenRequest(scope, account)
            );
            if (typeof authenticationResult?.accessToken !== 'string' || !authenticationResult.accessToken) {
                throw this.#createSafeTokenError(AUTHENTICATION_STATES.AUTHENTICATION_ERROR);
            }
            return authenticationResult.accessToken;
        } catch (error) {
            const state = error?.code === AUTHENTICATION_STATES.AUTHENTICATION_ERROR
                ? AUTHENTICATION_STATES.AUTHENTICATION_ERROR
                : this.#categorizeError(error);
            this.#setState(state);
            throw this.#createSafeTokenError(state);
        }
    }

    async signInRedirect(scope) {
        return this.#runRedirect(() => this.#client.loginRedirect({
            scopes: [this.#requireScope(scope)]
        }));
    }

    async acquireTokenRedirect(scope) {
        const account = this.#client.getActiveAccount();
        return this.#runRedirect(() => this.#client.acquireTokenRedirect({
            scopes: [this.#requireScope(scope)],
            account
        }));
    }

    async signOutRedirect() {
        const account = this.#client.getActiveAccount();
        try {
            await this.#client.logoutRedirect({ account });
            this.#setState(AUTHENTICATION_STATES.SIGNED_OUT);
        } catch (error) {
            const state = this.#setState(this.#categorizeError(error));
            throw this.#createSafeTokenError(state);
        }
    }

    async #initialize() {
        this.#setState(AUTHENTICATION_STATES.INITIALIZING);
        try {
            if (!this.#client) {
                const configuration = this.#configuration || createAuthenticationConfig();
                this.#client = new PublicClientApplication(configuration);
            }

            await this.#client.initialize();
            const redirectResult = await this.#client.handleRedirectPromise();
            let account = redirectResult?.account || this.#client.getActiveAccount();

            if (!account) {
                account = [...this.#client.getAllAccounts()]
                    .sort((left, right) => accountSortKey(left).localeCompare(accountSortKey(right)))[0] || null;
            }

            if (!account) {
                const ssoResult = await this.#client.ssoSilent({ scopes: [] });
                account = ssoResult?.account || null;
            }

            if (!account) {
                return this.#setState(AUTHENTICATION_STATES.SIGNED_OUT);
            }

            this.#client.setActiveAccount(account);
            return this.#setState(AUTHENTICATION_STATES.READY);
        } catch (error) {
            return this.#setState(this.#categorizeError(error));
        }
    }

    #categorizeError(error) {
        if (
            error instanceof InteractionRequiredAuthError ||
            error?.name === 'InteractionRequiredAuthError'
        ) {
            return AUTHENTICATION_STATES.INTERACTION_REQUIRED;
        }
        if (error?.code === AUTHENTICATION_ERROR_CODES.CONFIGURATION_INVALID) {
            return AUTHENTICATION_STATES.CONFIGURATION_ERROR;
        }
        if (NETWORK_ERROR_CODES.has(error?.errorCode || error?.code)) {
            return AUTHENTICATION_STATES.NETWORK_ERROR;
        }
        return AUTHENTICATION_STATES.AUTHENTICATION_ERROR;
    }

    #createTokenRequest(scope, account) {
        return {
            scopes: [this.#requireScope(scope)],
            account
        };
    }

    #requireScope(scope) {
        if (typeof scope !== 'string' || !scope.trim()) {
            throw this.#createSafeTokenError(AUTHENTICATION_STATES.AUTHENTICATION_ERROR);
        }
        return scope;
    }

    async #runRedirect(redirect) {
        try {
            await redirect();
        } catch (error) {
            const state = this.#setState(this.#categorizeError(error));
            throw this.#createSafeTokenError(state);
        }
    }

    #createSafeTokenError(code) {
        const error = new Error(MESSAGES.AUTHENTICATION_TOKEN_UNAVAILABLE);
        error.name = 'AuthenticationTokenError';
        error.code = code;
        return error;
    }

    #setState(state) {
        this.#state = state;
        eventBus.emit(APP_EVENTS.AUTHENTICATION_STATE_CHANGED, { state });
        return state;
    }
}
