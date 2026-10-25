/**
 * One-owner preview security boundary for Desktop Control remote.
 *
 * A valid bearer token or device ticket is necessary but not sufficient:
 * its VERIFIED owner must equal the singular owner configured outside Git.
 * Never take preview owner IDs from public tool arguments, HTTP JSON or URLs.
 * The auth service still rejects sign-in until an approved OAuth flow exists.
 */
const ownerFormat = /^[A-Za-z0-9._:-]{1,128}$/;

export function configuredPreviewOwner(env) {
  if (!env || env.PREVIEW_SINGLE_USER !== '1' ||
      typeof env.PREVIEW_OWNER_ID !== 'string' ||
      !ownerFormat.test(env.PREVIEW_OWNER_ID)) return null;
  return env.PREVIEW_OWNER_ID;
}

export function isAllowedPreviewOwner(verifiedOwnerId, env) {
  const expected = configuredPreviewOwner(env);
  return expected !== null &&
    typeof verifiedOwnerId === 'string' &&
    ownerFormat.test(verifiedOwnerId) &&
    verifiedOwnerId === expected;
}
