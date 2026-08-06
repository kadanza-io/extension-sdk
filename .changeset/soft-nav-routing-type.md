---
"@kadanza/extension-sdk": minor
---

Bidirectional navigation: declare `routingType` on `HANDSHAKE_INIT` (`server` | `client-hash`), add `REQUEST_NAVIGATION_CHANGE` / host `requestNavigationChange`, and child `onNavigate` for soft SPA navigation. Shared `PendingRequest` utility for timed request/ACK flows.
