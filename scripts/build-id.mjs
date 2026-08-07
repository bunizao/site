function normalizeEnvironmentValue(input) {
  return typeof input === 'string' ? input.trim() : '';
}

export function resolveCloudflareBuildId(env, now = Date.now()) {
  return normalizeEnvironmentValue(env.PUBLIC_BUILD_ID)
    || normalizeEnvironmentValue(env.CF_PAGES_COMMIT_SHA)
    || normalizeEnvironmentValue(env.GITHUB_SHA)
    || `build-${Math.max(0, Math.floor(now)).toString(36)}`;
}
