// Demonstrates the public extension SDK API.

import { createExtensionSDK } from "@kadanza/extension-sdk";
import { PlaygroundUI } from "./PlaygroundUI";

const sdk = createExtensionSDK();
const ui = new PlaygroundUI(sdk, {
  onEmitRequestAuthTokenRefresh: () => sdk.emitRequestAuthTokenRefresh(),
  onEmitUpdatePageSettings: (payload) => sdk.emitUpdatePageSettings(payload),
  onEmitNavigationChange: (payload) => sdk.emitNavigationChange(payload),
  onApiCall: (endpoint) => sdk.apiCall<unknown>(endpoint),
});

sdk.onLoadPageSettings((settings) => {
  ui.pageSettingsLoaded(settings);
});

sdk.onAuthTokenRefresh((authToken) => {
  ui.authTokenRefreshed(authToken);
});

window.addEventListener("pagehide", () => {
  sdk.destroy();
});

void sdk
  .connect({ authTokenAutoRefresh: true })
  .then((payload) => ui.connected(payload))
  .catch((error: unknown) => ui.connectionFailed(error));
