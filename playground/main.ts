import { createExtensionSDK } from "@kadanza/extension-sdk";

const app = document.querySelector<HTMLDivElement>("#app");
const sdk = createExtensionSDK();

if (app) {
  app.textContent = `Kadanza Extension SDK playground (wip=${String(sdk.wip)})`;
}
