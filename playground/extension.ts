import { createExtensionSDK } from "@kadanza/extension-sdk";

const stateEl = document.querySelector<HTMLPreElement>("#extension-state");
const logEl = document.querySelector<HTMLPreElement>("#extension-log");
const refreshBtn = document.querySelector<HTMLButtonElement>("#refresh-token");
const updateBtn = document.querySelector<HTMLButtonElement>("#update-settings");

if (!stateEl || !logEl || !refreshBtn || !updateBtn) {
  throw new Error("Extension playground DOM is incomplete.");
}

const sdk = createExtensionSDK();
const logLines: string[] = [];
let settingsRevision = 0;

function appendLog(message: string): void {
  const stamp = new Date().toISOString().slice(11, 23);
  logLines.unshift(`${stamp} ${message}`);
  logEl.textContent = logLines.slice(0, 80).join("\n");
}

function renderState(extra: Record<string, unknown> = {}): void {
  stateEl.textContent = JSON.stringify(
    {
      isConnected: sdk.isConnected,
      authToken: sdk.getAuthToken(),
      extensionDetails: sdk.getExtensionDetails(),
      designTokens: sdk.getDesignTokens(),
      pageSettings: sdk.getPageSettings(),
      ...extra,
    },
    null,
    2,
  );
}

function setActionsEnabled(enabled: boolean): void {
  refreshBtn.disabled = !enabled;
  updateBtn.disabled = !enabled;
}

sdk.onLoadPageSettings((settings) => {
  appendLog(`onLoadPageSettings ${JSON.stringify(settings)}`);
  renderState({ lastEvent: "LOAD_PAGE_SETTINGS" });
});

sdk.onTokenRefresh((token) => {
  appendLog(`onTokenRefresh ${JSON.stringify(token)}`);
  renderState({ lastEvent: "TOKEN_REFRESH" });
});

refreshBtn.addEventListener("click", () => {
  void sdk
    .requestTokenRefresh()
    .then((token) => {
      appendLog(`requestTokenRefresh resolved ${JSON.stringify(token)}`);
      renderState();
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      appendLog(`requestTokenRefresh failed: ${message}`);
    });
});

updateBtn.addEventListener("click", () => {
  settingsRevision += 1;
  const settings = {
    theme: settingsRevision % 2 === 0 ? "light" : "dark",
    itemsPerPage: 10 + settingsRevision,
    revision: settingsRevision,
  };

  void sdk
    .updatePageSettings(settings)
    .then((result) => {
      appendLog(`updatePageSettings resolved ${JSON.stringify(result)}`);
      renderState({ lastSubmittedSettings: settings });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      appendLog(`updatePageSettings failed: ${message}`);
    });
});

window.addEventListener("pagehide", () => {
  sdk.destroy();
});

void sdk
  .connect()
  .then((payload) => {
    appendLog(`connected tenant=${payload.extensionDetails.tenantDomain}`);
    setActionsEnabled(true);
    renderState({ handshake: payload });
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    appendLog(`connect failed: ${message}`);
    setActionsEnabled(false);
    renderState({ error: message });
  });
