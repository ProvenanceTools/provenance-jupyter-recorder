/**
 * Conformance: conformance vectors from the monorepo. A failure means the code is wrong,
 * never the vector.
 *
 * provjup imports log-core rather than porting it, so these tests prove two things: the
 * pinned submodule still reproduces the exported vectors, and log-core reaches this repo
 * only through `src/core/`, unchanged.
 *
 * Covered so far: the pinned SHA-256, hash-chain and signed-checkpoint vectors. The other
 * fixtures (keys, manifests, golden bundle) gate code that lands in Tasks 4 to 8.
 */

import { describe, expect, it } from 'vitest';
import { chainEntry, sha256Hex, signCheckpoint, verifyCheckpoint } from '../../src/core/index';
import type { Envelope } from '../../src/core/index';
import checkpointJson from './fixtures/checkpoint.json';
import vectorsJson from './fixtures/vectors.json';

interface Vectors {
  sha256: { input: string; hex: string }[];
  chain: { prev_hash: string; envelope: Envelope; hash: string }[];
}

const vectors = vectorsJson as unknown as Vectors;

describe('conformance: vectors.json', () => {
  it('has vectors to check', () => {
    expect(vectors.sha256.length).toBeGreaterThan(0);
    expect(vectors.chain.length).toBeGreaterThan(0);
  });

  it.each(vectors.sha256)('sha256($input)', ({ input, hex }) => {
    expect(sha256Hex(input)).toBe(hex);
  });

  it.each(vectors.chain)('chainEntry reproduces the pinned hash at seq $envelope.seq', (v) => {
    const entry = chainEntry(v.prev_hash, v.envelope);
    expect(entry.hash).toBe(v.hash);
    expect(entry.prev_hash).toBe(v.prev_hash);
  });
});

describe('conformance: checkpoint.json', () => {
  const { session_pubkey_hex, ...checkpoint } = checkpointJson;

  it('verifies against the session public key', async () => {
    expect(await verifyCheckpoint(checkpoint, session_pubkey_hex)).toBe(true);
  });

  it('is reproduced exactly by signCheckpoint, as the recorder signs', async () => {
    // The exporter signs (128, 'ab' x 32) with session seed 0x04: 32 bytes of 4
    // (tools/export-conformance-vectors.ts, vector 6). Ed25519 signatures are deterministic.
    const signed = await signCheckpoint(
      checkpoint.seq,
      checkpoint.hash,
      new Uint8Array(32).fill(4),
    );
    expect(signed).toEqual(checkpoint);
  });
});
