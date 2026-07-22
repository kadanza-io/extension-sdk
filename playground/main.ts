import { createKadanzaSDK } from "@kadanza/extension-sdk";

const app = document.querySelector<HTMLDivElement>("#app");
const sdk = createKadanzaSDK();

if (app) {
  app.textContent = `Kadanza Extension SDK playground (wip=${String(sdk.wip)})`;
}
