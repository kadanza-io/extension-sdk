# Flows

This page outlines the flows available to build with the extension SDK.

## Handshake

Establishes the connection and receives the initial context from the parent.

Wire: `HANDSHAKE_INIT` → `HANDSHAKE_ACK`

```ts
import { createExtensionSDK } from "@kadanza/extension-sdk";

const sdk = createExtensionSDK();
const { authToken, extensionDetails, designTokens, pageSettings } =
  await sdk.connect();
```

See [`HandshakePayload`](https://kadanza-io.github.io/extension-sdk/interfaces/HandshakePayload.html) for the returned data.

## Token refresh

Asks the parent for a new auth token, or listens when the parent pushes one.

Wire: `REQUEST_TOKEN_REFRESH` → `TOKEN_REFRESH`

```ts
// Request a refresh
const token = await sdk.requestTokenRefresh();

// Also listen for any token update (requested or parent-pushed)
sdk.onTokenRefresh((token) => {
  // use token.jwt
});
```

See [`requestTokenRefresh`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#requesttokenrefresh) and [`onTokenRefresh`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#ontokenrefresh).

## Page settings

The parent opens the extension's settings UI; the extension saves changes back.

Wire: `LOAD_PAGE_SETTINGS` → `UPDATE_PAGE_SETTINGS` → `PAGE_SETTINGS_UPDATED`

```ts
sdk.onLoadPageSettings((settings) => {
  // Parent app request the extension to open settings UI with initial values provided by the it
});

const { success } = await sdk.updatePageSettings({ setting1: 123 });
```

See [`onLoadPageSettings`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#onloadpagesettings) and [`updatePageSettings`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#updatepagesettings).

## Teardown

Call [`destroy()`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#destroy) when the extension unloads.

```ts
window.addEventListener("pagehide", () => {
  sdk.destroy();
});
```
