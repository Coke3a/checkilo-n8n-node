# Changelog

## 0.2.1

### Fixed

- `peerDependencies.n8n-workflow` is now `*` (was `^2.16.0`) to satisfy the n8n verified community-node requirement (`@n8n/community-nodes/valid-peer-dependencies`). The n8n host controls the `n8n-workflow` version at runtime, so a community node must accept any version. No functional change.

## 0.2.0

### Added

- **Checkilo node v2** (new default version) with a clearer UX:
  - `Event Ping` now has a **Result** dropdown (Success / Failure).
  - `Workflow Ping` events are **Start / Checkpoint / Finish**, where **Finish** adds a **Result** (Success / Failure).
  - **Metadata** is entered as key/value pairs (sent as a JSON body) instead of raw JSON.
  - The Checkilo `run` correlation id is now **always derived automatically** from the n8n execution ID — there is no user-entered Run ID field. Workflow steps share one value, and event pings also carry it so a ping can be traced back to its n8n execution.
- **App logo** (Checkilo "Quiet Tick") now shows on the node and credential instead of the default placeholder icon.
- Unit tests (vitest) covering the v2 URL, metadata, and run-id builders.

### Changed

- The node now uses full versioning. **v1 is preserved unchanged** — existing workflows keep their original behavior; only newly added nodes default to v2.

## 0.1.0

- Initial release: Checkilo node with `Event Ping` and `Workflow Ping`, API key credential, dynamic automation dropdown, and Error Trigger-friendly failure pings.
