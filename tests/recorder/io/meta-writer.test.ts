/**
 * Tests for src/recorder/io/meta-writer.ts. Cases follow the VS Code recorder's
 * meta-writer.test.ts: the file exists from create, and each checkpoint rewrites it whole.
 */

import { describe, expect, it } from 'vitest';
import {
  canonicalize,
  encryptSessionPrivkey,
  generateSessionKeypair,
  validateMetaShape,
} from '../../../src/core/index';
import type { Checkpoint, EncryptedPrivkey } from '../../../src/core/index';
import { MetaWriter, metaFileName } from '../../../src/recorder/io/meta-writer';
import type { Timers } from '../../../src/recorder/io/session-writer';
import { FakeServer } from '../../support/fake-server';

const SESSION_ID = '00000000-0000-4000-8000-0000000000bb';
const noTimers: Timers = { setInterval: () => 0, clearInterval: () => undefined };
const path = `hw1/.provenance/${metaFileName(SESSION_ID)}`;

async function setup() {
  const keypair = await generateSessionKeypair();
  const encryptedPrivkey: EncryptedPrivkey = await encryptSessionPrivkey(
    keypair.privateKey,
    'ab'.repeat(64),
    SESSION_ID,
  );
  const server = new FakeServer();
  const writer = await MetaWriter.create({
    server,
    dir: 'hw1',
    sessionId: SESSION_ID,
    sessionPubkeyHex: keypair.publicKeyHex,
    encryptedPrivkey,
    timers: noTimers,
  });
  return { server, writer, keypair, encryptedPrivkey };
}

const checkpoint = (seq: number): Checkpoint => ({
  seq,
  hash: 'a'.repeat(64),
  sig: 'b'.repeat(128),
});

describe('MetaWriter', () => {
  it('writes a valid meta on create, before any checkpoint', async () => {
    const { server, keypair, encryptedPrivkey } = await setup();
    const meta = JSON.parse(server.text(path));
    expect(validateMetaShape(meta).ok).toBe(true);
    expect(meta).toEqual({
      format_version: '1.0',
      session_id: SESSION_ID,
      session_pubkey: keypair.publicKeyHex,
      encrypted_session_privkey: encryptedPrivkey,
      checkpoints: [],
    });
  });

  it('writes canonical JSON, as VS Code does', async () => {
    const { server } = await setup();
    const text = server.text(path);
    expect(text).toBe(canonicalize(JSON.parse(text)));
  });

  it('rewrites the whole file with each checkpoint appended in order', async () => {
    const { server, writer } = await setup();
    await writer.appendCheckpoint(checkpoint(100));
    await writer.appendCheckpoint(checkpoint(200));
    const meta = JSON.parse(server.text(path));
    expect(validateMetaShape(meta).ok).toBe(true);
    expect(meta.checkpoints).toEqual([checkpoint(100), checkpoint(200)]);
  });
});
