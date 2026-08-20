---
"@kadanza/extension-sdk": minor
---

Handshake context is optional. `connect()` succeeds on `HANDSHAKE_ACK` even when `authToken`, `extensionDetails`, `designTokens`, or `pageSettings` are omitted; missing fields are `null`. Documented `designTokens` (tenant branding) and FO-only `spaceId` / `pageId`.
