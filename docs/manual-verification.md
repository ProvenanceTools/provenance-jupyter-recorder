# Manual Verification Checklist

Real-JupyterLab checks automated tests cannot cover. Each item is checked off only after
a human confirms it.

- [ ] Folder without a manifest: no status item and no `.provenance/` directory.
- [ ] Valid signed manifest: status shows "Provenance: recording".
- [ ] Tampered manifest: nothing records.
- [ ] Switch to another application and back: the log gets `focus.change` with `gained: false`,
  then `gained: true`. Unit tests cover this; a real browser has not been checked (#66).
- [ ] Same notebook in two tabs: one session writes.
- [ ] Hub idle shutdown: the next session recovers the chain.
