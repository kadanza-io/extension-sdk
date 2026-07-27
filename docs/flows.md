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

## API calls

Calls the Kadanza Platform API with connection details managed by the SDK.
The API origin is derived from `extensionDetails.baseUrl`; the latest auth
token and tenant domain are added as `Authorization` and `X-Tenant` headers.

```ts
interface User {
  firstName: string;
  lastName: string;
}

const user = await sdk.apiCall<User>("/platform/v1/api/users/me");

const asset = await sdk.apiCall<Asset>("/platform/v1/api/assets", {
  method: "POST",
  body: JSON.stringify({ name: "Example" }),
  headers: {
    "X-Custom-Header": "value",
  },
});
```

Endpoints must be root-relative paths beginning with a single `/`. Successful
responses are parsed as JSON. Non-2xx responses throw with the HTTP status.
A `401` is not retried automatically; use
[`emitRequestTokenRefresh()`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#emitrequesttokenrefresh)
when an explicit refresh is needed.

The SDK owns the `Authorization` and `X-Tenant` headers. Other fetch options and
headers can be supplied through `RequestInit`.

See [`apiCall`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#apicall).

## Token refresh

Asks the parent for a new auth token, or listens when the parent pushes one.

Wire: `REQUEST_TOKEN_REFRESH` → `TOKEN_REFRESH`

```ts
// Request a refresh
const token = await sdk.emitRequestTokenRefresh();

// Also listen for any token update (requested or parent-pushed)
sdk.onTokenRefresh((token) => {
  // use token.jwt
});
```

See [`emitRequestTokenRefresh`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#emitrequesttokenrefresh) and [`onTokenRefresh`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#ontokenrefresh).

## Page settings

The parent opens the extension's settings UI; the extension saves changes back.

Wire: `LOAD_PAGE_SETTINGS` → `UPDATE_PAGE_SETTINGS` → `PAGE_SETTINGS_UPDATED`

```ts
sdk.onLoadPageSettings((settings) => {
  // Parent app request the extension to open settings UI with initial values provided by the it
});

const { success } = await sdk.emitUpdatePageSettings({
  settings: { setting1: 123 },
});
```

See [`onLoadPageSettings`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#onloadpagesettings) and [`emitUpdatePageSettings`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#emitupdatepagesettings).

## Navigation change

Notifies the parent when the extension's route/path changes. Fire-and-forget; no ACK.

Wire: `NAVIGATION_CHANGE` (child → parent)

`tenantUrl` is read and validated by [`connect()`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#connect) — builders only pass the path.

```ts
await sdk.connect();

// Call whenever your app's path changes
sdk.emitNavigationChange({ path: "/demo" });
```

See [`emitNavigationChange`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#emitnavigationchange).

## Teardown

Call [`destroy()`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#destroy) when the extension unloads.

```ts
window.addEventListener("pagehide", () => {
  sdk.destroy();
});
```
