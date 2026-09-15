# @kadanza/extension-sdk

## 0.2.0

### Minor Changes

- 36cfd42: Carry query params through soft navigation.

  - `NavigationChangePayload` and `RequestNavigationChangePayload` gain an
    optional `search` field (query string incl. leading `?`).
  - `normalizeNavigationSearch` helper normalizes query strings (`""` when empty,
    single leading `?` otherwise).
  - Host correlates the `REQUEST_NAVIGATION_CHANGE` / `NAVIGATION_CHANGE` ACK on
    `path` **and** `search`, so query-only changes resolve the pending request.

  Enables hosts to restore extension query params after a full page reload.

- 36cfd42: Bidirectional soft navigation for SPA extensions (`server` | `client-hash`).

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

## 0.1.0

### Minor Changes

- 860cbbd: Handshake context is optional. `connect()` succeeds on `HANDSHAKE_ACK` even when `authToken`, `extensionDetails`, `designTokens`, or `pageSettings` are omitted; missing fields are `null`. Documented `designTokens` (tenant branding) and FO-only `spaceId` / `pageId`.

## 0.0.14

### Patch Changes

- 610bd6b: Add host-side extension logic

## 0.0.13

### Patch Changes

- 4ba839e: Combine workflows to be able to configure NPM Trusted publisher

## 0.0.12

### Patch Changes

- 0d22f06: Setup stable, rc and canary channels and automate publishing to NPM
