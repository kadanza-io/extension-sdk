# @kadanza/extension-sdk

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
