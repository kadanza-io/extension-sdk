# How Kadanza embeds an extension

Your extension runs inside the Kadanza web app as a full-size `<iframe>`. The host sets `src` to your extension’s public URL and talks to the iframe with `window.postMessage`, only with that URL’s origin.

## Allowed extension URL

The main app only loads an extension when its URL is valid HTTPS and its origin matches `https://*.kadanza.app` (hostname ends with `.kadanza.app`). Other origins are rejected.

## iframe `src`

The host starts from the configured extension URL, then adds a `tenantUrl` **search parameter**. That param’s value is the Kadanza parent app’s origin. It exists only on the iframe `src` query string — not as a separate parent-window field.

Example after the host enriches `src`:

```html
<iframe
  src="https://my-extension.kadanza.app?tenantUrl=https%3A%2F%2Facme.kadanza.io"
/>
```

- `https://my-extension.kadanza.app` — your extension’s deployed origin (must be `https://*.kadanza.app`).
- `tenantUrl=https://acme.kadanza.io` — parent origin, appended so the extension SDK can validate `postMessage` origins.

The host sends and accepts `postMessage` only against the extension URL’s origin (`https://my-extension.kadanza.app` in the example).
