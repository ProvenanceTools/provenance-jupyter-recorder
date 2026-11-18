# Releasing

Not written yet. Must cover the release build with the root key embedded, computing
`extension_hash` over the installed tree, and adding it to the monorepo allowlist.

Decided so far:

- **Allowlist:** each release's hash reaches `known-good-extension-hashes.json` through this
  repo's release step, which computes it with the recorder's own tested code and opens a pull
  request to the monorepo. Files are sorted by the byte order of their UTF-8 relative paths,
  with `/` separators, so the hash is the same on every platform (monorepo request 3).
- **Keystroke budget:** before each release, run `npm run build`, then
  `node scripts/browser-keystroke-check.mjs --large` with `JUPYTER` set. It fails if any
  keystroke handler's p99 is over 1 ms (see the README's "Development" section).
