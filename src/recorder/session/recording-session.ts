/**
 * One session's lifecycle: from session.start to session.end.
 *
 * Follows VS Code's `startSession` (session-registry.ts) steps 3a to 6, in the same order:
 * capture policy, session keypair, recorder context, writer, `.slog.meta`, host, then
 * session.start. Every 100th entry is checkpointed: signed with the session key off the keystroke
 * path and appended to `.slog.meta` (7.2). Later tasks add the steps VS Code takes after these:
 * identity (Task 8), chain recovery and the rolling seal (Task 7), and the remaining signal
 * wiring (Task 6).
 *
 * The session private key is kept in memory, and persisted only encrypted, in `.slog.meta`,
 * under a key derived from the manifest signature (VS Code step 4b).
 */

import { encryptSessionPrivkey, generateSessionKeypair } from '../../core/index';
import type { Clock, Manifest, SessionKeypair } from '../../core/index';
import { resolveVerifiedCapturePolicy } from '../activation/manifest-loader';
import type { FileWriteProblem } from '../io/atomic-write';
import { MetaWriter } from '../io/meta-writer';
import type { HostFacts, ProvjupServer } from '../io/server-client';
import { SessionWriter, type Timers, type WriterProblem } from '../io/session-writer';
import { FileWiring } from '../wiring/file-editor-wiring';
import { NotebookWiring } from '../wiring/notebook-wiring';
import { checkpointCadence } from './checkpoint-cadence';
import { CheckpointScheduler } from './checkpoint-scheduler';
import { buildRecorderContext } from './recorder-context';
import { createSessionHost, type SessionHost } from './session-host';

/** A write problem in either of a session's files. Recording continues; writes are retried. */
export type SessionProblem = WriterProblem | FileWriteProblem;

export interface StartSessionDeps {
  server: Pick<ProvjupServer, 'appendLog' | 'writeFile'>;
  /** Assignment root, relative to the server root. */
  root: string;
  manifest: Manifest;
  clock: Clock;
  host: HostFacts;
  recorderVersion: string;
  jupyterlabVersion: string;
  newSessionId?: () => string;
  generateKeypair?: () => Promise<SessionKeypair>;
  timers?: Timers;
  onProblem?: (problem: SessionProblem) => void;
  /** Runs checkpoint signing on a later macrotask. Default: `setTimeout(fn, 0)`. */
  deferCheckpoint?: (fn: () => void) => void;
}

export interface RecordingSession {
  readonly root: string;
  readonly sessionId: string;
  readonly sessionPubkeyHex: string;
  readonly host: SessionHost;
  readonly writer: SessionWriter;
  /** `.slog.meta`: the encrypted session key, and the signed checkpoints. */
  readonly meta: MetaWriter;
  /** Signs and writes a checkpoint every 100 entries; `drain()` waits for the latest. */
  readonly checkpoints: CheckpointScheduler;
  /** Notebook edits for files in this assignment, recorded as the text view. */
  readonly notebooks: NotebookWiring;
  /** Plain text file edits for files in this assignment. */
  readonly files: FileWiring;
  /** Emit session.end and write everything still buffered. Idempotent. */
  end(reason: string): Promise<void>;
}

export function slogFileName(sessionId: string): string {
  return `session-${sessionId}.slog`;
}

export async function startRecordingSession(deps: StartSessionDeps): Promise<RecordingSession> {
  const capturePolicy = resolveVerifiedCapturePolicy(deps.manifest);
  const keypair = await (deps.generateKeypair ?? generateSessionKeypair)();
  const sessionId = (deps.newSessionId ?? (() => crypto.randomUUID()))();

  const context = buildRecorderContext({
    manifest: deps.manifest,
    sessionId,
    prevSessionId: null,
    sessionPubkeyHex: keypair.publicKeyHex,
    host: deps.host,
    recorderVersion: deps.recorderVersion,
    jupyterlabVersion: deps.jupyterlabVersion,
  });

  const writer = new SessionWriter({
    server: deps.server,
    dir: deps.root,
    file: slogFileName(sessionId),
    clock: deps.clock,
    ...(deps.timers !== undefined ? { timers: deps.timers } : {}),
    ...(deps.onProblem !== undefined ? { onProblem: deps.onProblem } : {}),
  });

  // VS Code step 4b: the private key, encrypted under the manifest signature, so it cannot be
  // recovered without the course manifest. A failed write does not stop recording; it retries.
  const encryptedPrivkey = await encryptSessionPrivkey(
    keypair.privateKey,
    deps.manifest.sig,
    sessionId,
  );
  const meta = await MetaWriter.create({
    server: deps.server,
    dir: deps.root,
    sessionId,
    sessionPubkeyHex: keypair.publicKeyHex,
    encryptedPrivkey,
    ...(deps.timers !== undefined ? { timers: deps.timers } : {}),
    ...(deps.onProblem !== undefined ? { onProblem: deps.onProblem } : {}),
  });

  const cadence = checkpointCadence();
  const checkpoints = new CheckpointScheduler({
    privateKey: keypair.privateKey,
    write: (checkpoint) => meta.appendCheckpoint(checkpoint),
    ...(deps.deferCheckpoint !== undefined ? { defer: deps.deferCheckpoint } : {}),
  });

  const host = createSessionHost({
    sessionId,
    clock: deps.clock,
    capturePolicy,
    onEntry: (entry) => {
      writer.append(entry);
      if (cadence.entryWritten()) checkpoints.schedule(entry.seq, entry.hash);
    },
  });

  host.emit('session.start', context);
  // Write session.start now, so the log exists from the moment recording begins.
  await writer.flush();

  let ended = false;
  // Document events that arrive after the session ended (a late signal while the page
  // closes) are dropped instead of reaching a disposed writer.
  const emitWhileOpen: SessionHost['emit'] = (kind, data) => (ended ? null : host.emit(kind, data));
  const notebooks = new NotebookWiring({ emit: emitWhileOpen });
  const files = new FileWiring({ emit: emitWhileOpen });

  return {
    root: deps.root,
    sessionId,
    sessionPubkeyHex: keypair.publicKeyHex,
    host,
    writer,
    meta,
    checkpoints,
    notebooks,
    files,
    async end(reason: string): Promise<void> {
      if (ended) return;
      ended = true;
      host.emit('session.end', { reason });
      await writer.dispose();
      // As in VS Code: the last checkpoint lands in the meta before the meta writer closes.
      await checkpoints.drain();
      await meta.dispose();
    },
  };
}
