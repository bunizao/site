// Never derive the id from a commit SHA: Ghost deploy-hook rebuilds share a
// commit, and build-backed edge cache keys must roll on every build.
export function resolveCloudflareBuildId(env, now = Date.now()) {
  const pinned = typeof env.PUBLIC_BUILD_ID === 'string' ? env.PUBLIC_BUILD_ID.trim() : '';
  return pinned || `build-${Math.max(0, Math.floor(now)).toString(36)}`;
}
