# Vendored transcrypt

`transcrypt` is based on upstream 2.3.2 and retains its MIT copyright header.
Local portability and Git integration patches:

- `column` is optional; cipher choices fall back to an unformatted listing.
- The clean filter checks the input stream, not the working-copy file size.
  This permits encryption of temporary merge results with their logical path.
- The merge driver re-encrypts only temporary files. It does not write the
  working-copy path before Git finishes its checkout safety checks. Such writes
  made encrypted cherry-picks fail with a misleading dirty-file error.

The cipher, deterministic salt, key derivation and ciphertext format are
unchanged. `tests/unit/desk-unlock.test.ts` exercises real Git/OpenSSL workflows,
including encrypted cherry-picks with differing file sizes.
