---
"@kadanza/extension-sdk": minor
---

Bidirectional soft navigation for SPA extensions (`server` | `client-hash`).

**ExtensionSDK (child)**
- Declare `routingType` on `connect` / `HANDSHAKE_INIT`
- `onNavigate` — handle parent soft-nav requests
- `emitNavigationChange` — report path changes (and ACK)

**ExtensionSDKHost (parent)**
- `getRoutingType()` — last INIT routing type
- `requestNavigationChange` — soft-nav the child (waits for matching `NAVIGATION_CHANGE`)
- `onNavigationChange` — listen for child route changes
- `resolveHandshakePayload(extensionSDKHost)` — receives the host after INIT (use `getRoutingType()` while building the ACK)

Also: shared `PendingRequest` for timed request/ACK flows.
