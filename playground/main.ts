import type {
  HandshakePayload,
  PageSettings,
  ScopedExtensionToken,
} from "@kadanza/extension-sdk";
import {
  buildExtensionIframeSrc,
  createExtensionHostSDK,
} from "./extensionHostSDK";

const iframe = document.querySelector<HTMLIFrameElement>("#extension-frame");
const stateEl = document.querySelector<HTMLPreElement>("#parent-state");
const logEl = document.querySelector<HTMLPreElement>("#parent-log");
const loadSettingsBtn = document.querySelector<HTMLButtonElement>("#load-settings");
const reloadBtn = document.querySelector<HTMLButtonElement>("#reload-iframe");

if (!iframe || !stateEl || !logEl || !loadSettingsBtn || !reloadBtn) {
  throw new Error("Parent playground DOM is incomplete.");
}

const parentOrigin = window.location.origin;
let pageSettings: PageSettings = {
  theme: "light",
  itemsPerPage: 10,
};
let tokenCounter = 0;

const logLines: string[] = [];

function appendLog(direction: string, message: string): void {
  const stamp = new Date().toISOString().slice(11, 23);
  logLines.unshift(`${stamp} ${direction} ${message}`);
  logEl.textContent = logLines.slice(0, 80).join("\n");
}

function createScopedToken(label: string): ScopedExtensionToken {
  tokenCounter += 1;
  const expires = String(Math.floor(Date.now() / 1000) + 3600);
  return {
    jwt: `playground-scoped-token-${label}-${tokenCounter}`,
    expires,
  };
}

function buildHandshakePayload(): HandshakePayload {
  return {
    authToken: createScopedToken("handshake"),
    extensionDetails: {
      extensionId: "playground-extension",
      tenantId: "d8158c66-de63-11ef-a9c6-0242ac12000c",
      tenantDomain: "playground",
      baseUrl: "https://kadanza.io",
      spaceId: "f4b665e2-e54e-11ef-8f3f-0242ac12000d",
      pageId: "24aa37f0-f508-11f0-862b-1275795e8c9b",
      locale: "en-US",
    },
    designTokens: {
      primaryColor: "#4f46e5",
      fontFamily: "Inter",
      borderRadius: "md",
    },
    pageSettings,
  };
}

const host = createExtensionHostSDK({
  iframe,
  allowedChildOrigins: [parentOrigin],
  provideHandshakePayload: () => buildHandshakePayload(),
  provideScopedToken: () => createScopedToken("refresh"),
  onUpdatePageSettings: (settings) => {
    pageSettings = { ...settings };
    renderState();
    return { success: true };
  },
  onMessage: appendLog,
});

function renderState(): void {
  stateEl.textContent = JSON.stringify(
    {
      connected: host.isConnected,
      parentOrigin,
      pageSettings,
      tokenCounter,
    },
    null,
    2,
  );
}

host.onConnected(() => {
  loadSettingsBtn.disabled = false;
  renderState();
});

host.onDisconnected(() => {
  loadSettingsBtn.disabled = true;
  renderState();
});

function mountIframe(): void {
  host.resetConnection();
  loadSettingsBtn.disabled = true;
  renderState();

  const src = buildExtensionIframeSrc("/extension.html", parentOrigin);
  iframe.src = src;
  appendLog("!", `iframe src=${src}`);
}

loadSettingsBtn.addEventListener("click", () => {
  host.loadPageSettings(pageSettings);
});

reloadBtn.addEventListener("click", () => {
  mountIframe();
});

host.start();
mountIframe();
renderState();
