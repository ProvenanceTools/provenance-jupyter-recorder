/**
 * The `ext.snapshot` payload from the installed extensions.
 *
 * JupyterLab has two kinds, and a tool such as jupyter-ai ships both, so both are listed
 * (decided for 8.5, 2026-11-18): labextensions by npm name, and server extensions by Python
 * name. The server reports versions (`GET /provjup/extensions`); whether a labextension is
 * enabled comes from the page's own configuration, which is what this page actually loaded.
 */

import type { ExtSnapshotPayload } from '../../core/index';

export interface ExtensionInventory {
  lab: readonly { name: string; version: string }[];
  server: readonly { name: string; version: string; enabled: boolean }[];
}

export function extSnapshotPayload(
  inventory: ExtensionInventory,
  isLabDisabled: (name: string) => boolean,
): ExtSnapshotPayload {
  const extensions = [
    ...inventory.lab.map((e) => ({
      id: e.name,
      version: e.version,
      enabled: !isLabDisabled(e.name),
    })),
    ...inventory.server.map((e) => ({ id: e.name, version: e.version, enabled: e.enabled })),
  ];
  return { extensions };
}
