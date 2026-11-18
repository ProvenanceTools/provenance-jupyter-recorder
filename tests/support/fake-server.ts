/**
 * An in-memory stand-in for the provjup server extension. Appends follow the same offset rule
 * as `provjup/fs/slog_append.py`, whole-file writes replace the file as
 * `provjup/fs/atomic_write.py` does, and a test can make the next appends or writes fail.
 */

import type { ExtensionInventory } from '../../src/recorder/events/snapshot-payloads';
import type {
  AppendResult,
  FetchResult,
  HostFacts,
  ManifestFile,
  ProvjupServer,
  WriteResult,
} from '../../src/recorder/io/server-client';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class FakeServer implements ProvjupServer {
  readonly files = new Map<string, Uint8Array>();
  manifests: ManifestFile[] = [];
  host: HostFacts = { hostname: 'jupyter-student', username: 'jovyan', platform: 'Linux' };
  inventory: ExtensionInventory = { lab: [], server: [] };
  /** Fail this many upcoming appends without writing. */
  failNext = 0;
  /** Write this many upcoming appends but report a network error, as a lost reply would. */
  loseReplies = 0;
  appendCalls = 0;
  /** Fail this many upcoming whole-file writes without writing. */
  failNextWrites = 0;
  writeCalls = 0;

  text(path: string): string {
    return decoder.decode(this.files.get(path) ?? new Uint8Array());
  }

  /** Simulate another writer appending to a file. */
  foreignWrite(path: string, data: string): void {
    const current = this.files.get(path) ?? new Uint8Array();
    this.files.set(path, concat(current, encoder.encode(data)));
  }

  listManifests(): Promise<FetchResult<ManifestFile[]>> {
    return Promise.resolve({ ok: true, value: this.manifests });
  }

  hostFacts(): Promise<FetchResult<HostFacts>> {
    return Promise.resolve({ ok: true, value: this.host });
  }

  extensions(): Promise<FetchResult<ExtensionInventory>> {
    return Promise.resolve({ ok: true, value: this.inventory });
  }

  appendLog(dir: string, file: string, offset: number, data: string): Promise<AppendResult> {
    this.appendCalls++;
    if (this.failNext > 0) {
      this.failNext--;
      return Promise.resolve({ kind: 'error', message: 'network down' });
    }
    const path = `${dir}/.provenance/${file}`;
    const current = this.files.get(path) ?? new Uint8Array();
    if (current.length !== offset) {
      return Promise.resolve({ kind: 'offset_mismatch', size: current.length });
    }
    const next = concat(current, encoder.encode(data));
    this.files.set(path, next);
    if (this.loseReplies > 0) {
      this.loseReplies--;
      return Promise.resolve({ kind: 'error', message: 'reply lost' });
    }
    return Promise.resolve({ kind: 'ok', size: next.length });
  }

  writeFile(dir: string, file: string, data: string): Promise<WriteResult> {
    this.writeCalls++;
    if (this.failNextWrites > 0) {
      this.failNextWrites--;
      return Promise.resolve({ kind: 'error', message: 'disk full' });
    }
    const bytes = encoder.encode(data);
    this.files.set(`${dir}/.provenance/${file}`, bytes);
    return Promise.resolve({ kind: 'ok', size: bytes.length });
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
