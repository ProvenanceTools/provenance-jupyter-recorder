/**
 * The single import site for the VS Code recorder's pure helpers (decision 7, option D).
 *
 * Everything here is re-exported unchanged from the monorepo's `packages/recorder/src`, pinned
 * by the `vendor/provenance` submodule and built by `npm run build:vscode-recorder`
 * (`tsconfig.vscode-recorder.json`). One copy, owned by the monorepo: never copy these files
 * into this repo. Helpers that import `vscode` cannot come through here; port them instead.
 *
 * These are the recorder's internal files, not a published package, so a monorepo change that
 * moves one breaks this build. That is intended: it fails loudly rather than drifting.
 *
 * Re-export only what is in use, so the boundary stays reviewable.
 */

export { MAX_INLINE_BYTES } from '../../vendor/provenance/packages/recorder/dist/provjup/events/inline-content-limits.js';
