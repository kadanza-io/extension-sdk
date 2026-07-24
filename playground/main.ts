// Demonstrates the public extension SDK API.

import { createExtensionSDK } from "@kadanza/extension-sdk";
import { PlaygroundUI } from "./PlaygroundUI";

const sdk = createExtensionSDK();
const ui = new PlaygroundUI(sdk, {
  onRequestTokenRefresh: () => sdk.requestTokenRefresh(),
  onUpdatePageSettings: (settings) => sdk.updatePageSettings(settings),
});

sdk.onLoadPageSettings((settings) => {
  ui.pageSettingsLoaded(settings);
});

sdk.onTokenRefresh((token) => {
  ui.tokenRefreshed(token);
});

window.addEventListener("pagehide", () => {
  sdk.destroy();
});

void sdk
  .connect()
  .then((payload) => ui.connected(payload))
  .catch((error: unknown) => ui.connectionFailed(error));
