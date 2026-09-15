---
"@kadanza/extension-sdk": minor
---

Carry query params through soft navigation.

- `NavigationChangePayload` and `RequestNavigationChangePayload` gain an
  optional `search` field (query string incl. leading `?`).
- `normalizeNavigationSearch` helper normalizes query strings (`""` when empty,
  single leading `?` otherwise).
- Host correlates the `REQUEST_NAVIGATION_CHANGE` / `NAVIGATION_CHANGE` ACK on
  `path` **and** `search`, so query-only changes resolve the pending request.

Enables hosts to restore extension query params after a full page reload.
