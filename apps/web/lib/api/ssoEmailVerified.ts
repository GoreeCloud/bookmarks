/**
 * Returns true only when the identity provider positively asserts that the
 * user's email address has been verified — the OIDC `email_verified` standard
 * claim (OpenID Connect Core §5.1).
 *
 * Used to gate auto-linking an SSO identity to an EXISTING local account. The
 * email claim alone is not proof of ownership, so without this check anyone
 * able to register a victim's email at a configured SSO provider could take
 * over the victim's account.
 *
 * Fail-closed by design: an absent claim, a differently-named flag (e.g.
 * Discord's `verified`), or any non-`true` value all return false. A
 * missing/renamed claim can therefore only ever refuse a legitimate link — it
 * can never let an unverified identity through. Some IdPs / userinfo endpoints
 * (e.g. AWS Cognito) send the claim as the string "true", which is accepted.
 */
export function ssoEmailVerified(profile: unknown): boolean {
  const claim = (profile as { email_verified?: unknown } | null | undefined)
    ?.email_verified;

  return claim === true || claim === "true";
}
