/**
 * MetaWriter: owns the in-memory `SlogMeta` and writes `session-<uuid>.slog.meta` whole.
 *
 * Ported from the VS Code recorder's `io/meta-writer.ts`. The meta file holds the session id,
 * the session public key, the session private key encrypted under a key derived from the
 * manifest signature (log-core `encryptSessionPrivkey`), and the signed checkpoints (Task 7.2).
 * It is serialized with log-core's `canonicalize` and written on create, so it exists from
 * session start, and again after each checkpoint.
 *
 * One difference from VS Code: the write goes through `AtomicFileWriter`, so a failed write is
 * retried rather than failing the session (see `atomic-write.ts`).
 */

import { canonicalize } from '../../core/index';
import type { Checkpoint, EncryptedPrivkey, SlogMeta } from '../../core/index';
import { AtomicFileWriter, type AtomicFileWriterOptions } from './atomic-write';

export function metaFileName(sessionId: string): string {
  return `session-${sessionId}.slog.meta`;
}

export interface MetaWriterOptions extends Omit<AtomicFileWriterOptions, 'file'> {
  sessionId: string;
  sessionPubkeyHex: string;
  encryptedPrivkey: EncryptedPrivkey;
}

export class MetaWriter {
  private readonly checkpoints: Checkpoint[] = [];

  private constructor(
    private readonly meta: SlogMeta,
    private readonly file: AtomicFileWriter,
  ) {}

  /**
   * Create the writer and make the first write, so the meta exists from session start. Resolves
   * after that attempt whether or not it landed; a failed write keeps retrying.
   */
  static async create(options: MetaWriterOptions): Promise<MetaWriter> {
    const { sessionId, sessionPubkeyHex, encryptedPrivkey, ...fileOptions } = options;
    const writer = new MetaWriter(
      {
        format_version: '1.0',
        session_id: sessionId,
        session_pubkey: sessionPubkeyHex,
        encrypted_session_privkey: encryptedPrivkey,
        checkpoints: [],
      },
      new AtomicFileWriter({ ...fileOptions, file: metaFileName(sessionId) }),
    );
    await writer.write();
    return writer;
  }

  /** Append a checkpoint and rewrite the meta file. */
  appendCheckpoint(checkpoint: Checkpoint): Promise<void> {
    this.checkpoints.push(checkpoint);
    return this.write();
  }

  /** Whether the latest meta is still waiting to land. */
  get hasPending(): boolean {
    return this.file.hasPending;
  }

  /** Stop retrying after one last attempt. Idempotent. */
  dispose(): Promise<void> {
    return this.file.dispose();
  }

  private write(): Promise<void> {
    return this.file.write(canonicalize({ ...this.meta, checkpoints: this.checkpoints }));
  }
}
