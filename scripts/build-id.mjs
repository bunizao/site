function value(input) {
  return typeof input === 'string' ? input.trim() : '';
}

export function resolveCloudflareBuildId(env, now = Date.now()) {
  return value(env.PUBLIC_BUILD_ID)
    || value(env.CF_PAGES_COMMIT_SHA)
    || value(env.GITHUB_SHA)
    || `build-${Math.max(0, Math.floor(now)).toString(36)}`;
}
