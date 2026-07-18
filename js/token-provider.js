/**
 * @fileoverview Narrow access-token boundary between authentication and requests.
 */

/**
 * Exposes only request-time token acquisition for a declared resource scope.
 * The returned token is never retained by this provider.
 *
 * @param {AuthenticationService} authenticationService Sole MSAL owner.
 * @returns {{getToken(scope: string): Promise<string>}} Immutable token provider.
 */
export function createTokenProvider(authenticationService) {
    return Object.freeze({
        getToken(scope) {
            return authenticationService.getAccessToken(scope);
        }
    });
}
