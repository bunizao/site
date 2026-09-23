/** Accept only the same-origin avatar route emitted by site-api. Reader data
    never gets to turn an image element into an arbitrary request. */
const READER_AVATAR_PATH = /^\/v2\/reader\/avatar\/[a-f0-9]{64}$/;

export function safeReaderAvatarUrl(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && READER_AVATAR_PATH.test(value) ? `/api${value}` : undefined;
}
