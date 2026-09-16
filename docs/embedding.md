# How Kadanza embeds an extension

Your extension runs inside the Kadanza web app as a full-size `<iframe>`. The host sets `src` to your extension’s public HTTPS URL and talks to the iframe with `window.postMessage`, only with that URL’s origin.

This page is for **extension builders** (iframe `src` and `tenantUrl`) and for the **Kadanza parent app** (host API). Builders should not reimplement the wire protocol — use `createExtensionSDK()` from this package. Protocol payloads are in [Flows](flows.md).

## iframe `src`

The host starts from the configured extension URL (**Base URL** on the local extension), then adds a `tenantUrl` **search parameter**. That param’s value is the Kadanza parent app’s origin. It exists only on the iframe `src` query string — not as a separate parent-window field.

Example after the host enriches `src`:

```html
<iframe
  src="https://my-extension.example.com?tenantUrl=https%3A%2F%2Facme.kadanza.io"
/>
```

- `https://my-extension.example.com` — your extension’s deployed origin.
- `tenantUrl=https://acme.kadanza.io` — parent origin, appended so the extension SDK can validate `postMessage` origins.

The host sends and accepts `postMessage` only against the extension URL’s origin (`https://my-extension.example.com` in the example).

`isValidExtensionUrl` requires HTTPS. Pass an optional `checkOrigin` predicate when the host needs an extra origin allowlist.

## Host integration

The Kadanza parent app should use the host API from this package — do not reimplement the wire protocol. Third-party builders do not call `ExtensionSDKHost`; they call `createExtensionSDK()` in the iframe.

`HANDSHAKE_ACK` context is optional. Send `designTokens` whenever a tenant is in context. Include `spaceId` / `pageId` only on Experience Pages. The child SDK still connects if a field is omitted.

```ts
import {
  ExtensionSDKHost,
  enrichExtensionUrl,
  isValidExtensionUrl,
  type HandshakePayload,
} from "@kadanza/extension-sdk";

if (!isValidExtensionUrl(extensionUrl)) {
  throw new Error("Invalid extension URL");
}

const src = enrichExtensionUrl(extensionUrl)?.toString();

const extensionSDKHost = new ExtensionSDKHost({
  getContentWindow: () => iframe.contentWindow,
  origin: new URL(extensionUrl).origin,
  resolveHandshakePayload: async (
    extensionSDKHost,
  ): Promise<Partial<HandshakePayload>> => {
    const routingType = extensionSDKHost.getRoutingType();
    // Mint / load auth token + context; return HandshakePayload
    // (designTokens when a tenant is in context; spaceId/pageId on FO only)
  },
  resolveAuthToken: async () => {
    // Mint a fresh auth token for TOKEN_REFRESH
  },
  onUpdatePageSettings: async (settings) => {
    // Persist settings; return true on success
    return true;
  },
  onNavigationChange: ({ path }) => {
    // Child reported a route change — sync host URL / sidebar
  },
});

extensionSDKHost.start();
// Soft nav (when routingType is client-hash):
//   await extensionSDKHost.requestNavigationChange({ path: "/settings" });
// Later: extensionSDKHost.emitLoadPageSettings(settings);
// On teardown: extensionSDKHost.destroy();
```

Shared event names and payload shapes are documented in [Flows](flows.md). URL helpers (`isValidExtensionUrl`, `enrichExtensionUrl`) and low-level `postToChild` / `subscribeToChildMessages` are also exported for hosts that need them outside `ExtensionSDKHost`.
