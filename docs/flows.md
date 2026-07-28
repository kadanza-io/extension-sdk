# Flows

This page outlines the flows available to build with the extension SDK.

## Handshake

Establishes the connection and receives the initial context from the parent.

Wire: `HANDSHAKE_INIT` → `HANDSHAKE_ACK`

[`createExtensionSDK()`](https://kadanza-io.github.io/extension-sdk/functions/createExtensionSDK.html) returns a singleton — use one SDK instance per app. Repeated [`connect()`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#connect) calls are safe: an in-flight handshake shares one promise; after connect, the cached payload is returned and `authTokenAutoRefresh` / `authTokenBufferMs` are re-applied without another init.

```ts
import { createExtensionSDK } from "@kadanza/extension-sdk";

const sdk = createExtensionSDK();
const { authToken, extensionDetails, designTokens, pageSettings } =
  await sdk.connect();
```

See [`HandshakePayload`](https://kadanza-io.github.io/extension-sdk/interfaces/HandshakePayload.html) for the returned data.

After `connect` starts, [`getAllowedOrigin()`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#getallowedorigin) and [`getTenantUrl()`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#gettenanturl) expose the parent origin and raw `tenantUrl` search param. After handshake, [`getApiUrl()`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#getapiurl) returns the Platform API origin.

## API calls

Calls the Kadanza Platform API with connection details managed by the SDK.
The API origin is derived from `extensionDetails.baseUrl`; the latest auth
token JWT and tenant domain are added as `Authorization` and `X-Tenant` headers.

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
[`emitRequestAuthTokenRefresh()`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#emitrequestauthtokenrefresh)
when an explicit refresh is needed.

The SDK owns the `Authorization` and `X-Tenant` headers. Other fetch options and
headers can be supplied through `RequestInit`.

See [`apiCall`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#apicall).
Use [`getApiUrl()`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#getapiurl) when you need the derived API origin for custom requests.

## Auth token refresh

Asks the parent for a new auth token, or listens when the parent pushes one.

Wire: `REQUEST_TOKEN_REFRESH` → `TOKEN_REFRESH`

```ts
// Request a refresh
const authToken = await sdk.emitRequestAuthTokenRefresh();

// Also listen for any auth-token update (requested or parent-pushed)
sdk.onAuthTokenRefresh((authToken) => {
  // use authToken.jwt
});
```

### Proactive refresh

Opt-in automatic refresh before expiry. Disabled by default.

```ts
await sdk.connect({
  // optional; default is false
  authTokenAutoRefresh: true,
  // optional; default is 120_000 (2 minutes)
  authTokenBufferMs: 2 * 60_000,
});
```

When enabled, the SDK schedules a one-shot timer from `authToken.expires`
and calls [`emitRequestAuthTokenRefresh()`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#emitrequestauthtokenrefresh)
before expiry. Handshake and every auth-token update (manual, parent-pushed, or
automatic) reschedule from the new expiry.

If an automatic refresh fails or times out, the SDK retries once after 30
seconds while the same auth token is still current and unexpired. The schedule
is cleared by [`destroy()`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#destroy).

See [`emitRequestAuthTokenRefresh`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#emitrequestauthtokenrefresh) and [`onAuthTokenRefresh`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#onauthtokenrefresh).

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

Call [`destroy()`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#destroy) when the extension unloads. That also clears the `createExtensionSDK` singleton so a later create call can return a fresh instance.

```ts
window.addEventListener("pagehide", () => {
  sdk.destroy();
});
```
