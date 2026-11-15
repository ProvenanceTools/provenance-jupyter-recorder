import { beforeAll, describe, expect, it } from 'vitest';
import {
  FixedClock,
  decryptSessionPrivkey,
  generateSessionKeypair,
  parseEntries,
  validateChain,
  validateMetaShape,
} from '../../../src/core/index';
import type {
  HashedEnvelope,
  Manifest,
  SessionKeypair,
  SessionStartPayload,
} from '../../../src/core/index';
import { metaFileName } from '../../../src/recorder/io/meta-writer';
import { verifyManifestText } from '../../../src/recorder/activation/manifest-loader';
import type { Timers } from '../../../src/recorder/io/session-writer';
import {
  slogFileName,
  startRecordingSession,
} from '../../../src/recorder/session/recording-session';
import { SessionRegistry } from '../../../src/recorder/session/session-registry';
import { FakeServer } from '../../support/fake-server';
import { signedManifest, testKey } from '../../support/manifests';

const SESSION_ID = '00000000-0000-4000-8000-0000000000aa';
const noTimers: Timers = { setInterval: () => 0, clearInterval: () => undefined };

let manifest: Manifest;

beforeAll(async () => {
  const root = await testKey();
  const result = await verifyManifestText(
    JSON.stringify(await signedManifest({ root })),
    root.publicKeyHex,
  );
  if (!result.ok) throw new Error('fixture manifest did not verify');
  manifest = result.value;
});

async function start(
  server: FakeServer,
  root = 'data100/hw1',
  sessionId = SESSION_ID,
  keypair?: SessionKeypair,
) {
  return startRecordingSession({
    server,
    root,
    manifest,
    clock: new FixedClock(0, new Date('2026-11-13T00:00:00.000Z')),
    host: server.host,
    recorderVersion: '0.0.0',
    jupyterlabVersion: '4.5.0',
    newSessionId: () => sessionId,
    timers: noTimers,
    ...(keypair !== undefined ? { generateKeypair: () => Promise.resolve(keypair) } : {}),
  });
}

function entries(server: FakeServer, path: string): readonly HashedEnvelope[] {
  const result = parseEntries(server.text(path));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

describe('startRecordingSession', () => {
  it('writes a chained session.start to .provenance/session-<id>.slog straight away', async () => {
    const server = new FakeServer();
    const session = await start(server);
    const path = `data100/hw1/.provenance/${slogFileName(SESSION_ID)}`;
    const log = entries(server, path);
    expect(log.map((e) => e.kind)).toEqual(['session.start']);
    expect(validateChain(log).ok).toBe(true);
    const data = log[0]!.data as SessionStartPayload;
    expect(data.session_id).toBe(SESSION_ID);
    expect(data.session_pubkey).toBe(session.sessionPubkeyHex);
    expect(data.manifest_sig).toBe(manifest.sig);
  });

  it('ends with session.end, chained after everything else; end is idempotent', async () => {
    const server = new FakeServer();
    const session = await start(server);
    session.host.emit('doc.close', { path: 'hw1.ipynb' });
    await session.end('closed');
    await session.end('closed again');
    const log = entries(server, `data100/hw1/.provenance/${slogFileName(SESSION_ID)}`);
    expect(log.map((e) => e.kind)).toEqual(['session.start', 'doc.close', 'session.end']);
    expect(log[2]!.data).toEqual({ reason: 'closed' });
    expect(validateChain(log).ok).toBe(true);
  });
});

describe('startRecordingSession: .slog.meta', () => {
  const metaPath = `data100/hw1/.provenance/${metaFileName(SESSION_ID)}`;

  it('writes the meta before session.start, holding the key encrypted under the manifest sig', async () => {
    const server = new FakeServer();
    const keypair = await generateSessionKeypair();
    await start(server, 'data100/hw1', SESSION_ID, keypair);

    // Written first, as VS Code does at step 4b, before the host emits session.start.
    expect([...server.files.keys()][0]).toBe(metaPath);
    const shape = validateMetaShape(JSON.parse(server.text(metaPath)));
    if (!shape.ok) throw new Error(JSON.stringify(shape.error));
    expect(shape.value.session_id).toBe(SESSION_ID);
    expect(shape.value.session_pubkey).toBe(keypair.publicKeyHex);
    expect(shape.value.checkpoints).toEqual([]);

    const decrypted = await decryptSessionPrivkey(
      shape.value.encrypted_session_privkey,
      manifest.sig,
    );
    expect(Buffer.from(decrypted).equals(Buffer.from(keypair.privateKey))).toBe(true);
    await expect(
      decryptSessionPrivkey(shape.value.encrypted_session_privkey, 'ab'.repeat(64)),
    ).rejects.toThrow();
    // The private key never appears in the clear.
    expect(server.text(metaPath)).not.toContain(Buffer.from(keypair.privateKey).toString('hex'));
  });

  it('still records when the meta write fails, and writes the meta on the next try', async () => {
    const server = new FakeServer();
    server.failNextWrites = 1;
    const problems: unknown[] = [];
    const session = await startRecordingSession({
      server,
      root: 'data100/hw1',
      manifest,
      clock: new FixedClock(),
      host: server.host,
      recorderVersion: '0.0.0',
      jupyterlabVersion: '4.5.0',
      newSessionId: () => SESSION_ID,
      timers: noTimers,
      onProblem: (problem) => problems.push(problem),
    });

    expect(problems).toEqual([
      { kind: 'file_write_failed', file: metaFileName(SESSION_ID), message: 'disk full' },
    ]);
    expect(server.files.has(metaPath)).toBe(false);
    expect(entries(server, `data100/hw1/.provenance/${slogFileName(SESSION_ID)}`)[0]!.kind).toBe(
      'session.start',
    );
    expect(session.meta.hasPending).toBe(true);

    await session.end('closed'); // ending makes one last attempt
    expect(validateMetaShape(JSON.parse(server.text(metaPath))).ok).toBe(true);
    expect(session.meta.hasPending).toBe(false);
  });
});

describe('SessionRegistry', () => {
  it('ends every session and forgets them', async () => {
    const server = new FakeServer();
    const registry = new SessionRegistry();
    registry.add(await start(server, 'hw1', '00000000-0000-4000-8000-000000000001'));
    registry.add(await start(server, 'hw2', '00000000-0000-4000-8000-000000000002'));
    expect(registry.get('hw2')?.sessionId).toBe('00000000-0000-4000-8000-000000000002');
    await registry.endAll('shutdown');
    expect(registry.all()).toEqual([]);
    for (const root of ['hw1', 'hw2']) {
      const file = [...server.files.keys()].find(
        (p) => p.startsWith(`${root}/`) && p.endsWith('.slog'),
      )!;
      expect(entries(server, file).map((e) => e.kind)).toEqual(['session.start', 'session.end']);
    }
  });
});
