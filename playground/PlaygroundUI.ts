// Playground demo UI and presentation helpers for the extension SDK.

import type {
  HandshakePayload,
  IExtensionSDK,
  PageSettings,
  PageSettingsUpdatedPayload,
  ScopedExtensionToken,
} from "@kadanza/extension-sdk";

export interface PlaygroundUIOptions {
  onRequestTokenRefresh: () => Promise<ScopedExtensionToken>;
  onUpdatePageSettings: (
    settings: PageSettings,
  ) => Promise<PageSettingsUpdatedPayload>;
}

export interface PlaygroundUIState {
  isConnected: boolean;
  authToken: unknown;
  extensionDetails: unknown;
  designTokens: unknown;
  pageSettings: unknown;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  datetime: string;
  message: string;
}

function requireEl<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) {
    throw new Error(
      `Extension playground DOM is incomplete: missing ${selector}`,
    );
  }
  return el;
}

function parseSettingsJson(raw: string): PageSettings {
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Settings payload must be a JSON object.");
  }
  return parsed as PageSettings;
}

export class PlaygroundUI {
  readonly #sdk: IExtensionSDK;
  readonly #options: PlaygroundUIOptions;
  readonly #stateEl: HTMLPreElement;
  readonly #logEl: HTMLOListElement;
  readonly #refreshBtn: HTMLButtonElement;
  readonly #logEntries: LogEntry[] = [];

  constructor(sdk: IExtensionSDK, options: PlaygroundUIOptions) {
    this.#sdk = sdk;
    this.#options = options;
    this.#stateEl = requireEl<HTMLPreElement>("#extension-state");
    this.#logEl = requireEl<HTMLOListElement>("#extension-log");
    this.#refreshBtn = requireEl<HTMLButtonElement>("#refresh-token");

    this.#refreshBtn.addEventListener("click", () => {
      void this.#handleTokenRefresh();
    });
  }

  connected(payload: HandshakePayload): void {
    this.#appendLog(
      `connected tenant=${payload.extensionDetails.tenantDomain}`,
    );
    this.#setActionsEnabled(true);
    this.#renderFromSdk({ handshake: payload });
  }

  connectionFailed(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.#appendLog(`connect failed: ${message}`);
    this.#setActionsEnabled(false);
    this.#renderFromSdk({ error: message });
  }

  pageSettingsLoaded(settings: PageSettings): void {
    this.#appendLog(`onLoadPageSettings ${JSON.stringify(settings)}`);
    this.#renderFromSdk({ lastEvent: "LOAD_PAGE_SETTINGS" });
    void this.#promptAndUpdatePageSettings();
  }

  tokenRefreshed(token: ScopedExtensionToken): void {
    this.#appendLog(`onTokenRefresh ${JSON.stringify(token)}`);
    this.#renderFromSdk({ lastEvent: "TOKEN_REFRESH" });
  }

  async #handleTokenRefresh(): Promise<void> {
    try {
      const token = await this.#options.onRequestTokenRefresh();
      this.#appendLog(`requestTokenRefresh resolved ${JSON.stringify(token)}`);
      this.#renderFromSdk();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.#appendLog(`requestTokenRefresh failed: ${message}`);
    }
  }

  async #promptAndUpdatePageSettings(): Promise<void> {
    const raw = window.prompt(
      "Enter page settings as a JSON object string:",
      '{"a": 1, "b": 2}',
    );

    if (raw === null) {
      this.#appendLog("updatePageSettings cancelled");
      return;
    }

    let settings: PageSettings;
    try {
      settings = parseSettingsJson(raw);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.#appendLog(`updatePageSettings parse failed: ${message}`);
      return;
    }

    try {
      const result = await this.#options.onUpdatePageSettings(settings);
      this.#appendLog(`updatePageSettings resolved ${JSON.stringify(result)}`);
      this.#renderFromSdk({ lastSubmittedSettings: settings });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.#appendLog(`updatePageSettings failed: ${message}`);
    }
  }

  #setActionsEnabled(enabled: boolean): void {
    this.#refreshBtn.disabled = !enabled;
  }

  #appendLog(message: string): void {
    const now = new Date();
    this.#logEntries.unshift({
      timestamp: now.toISOString().slice(11, 23),
      datetime: now.toISOString(),
      message,
    });
    this.#renderLog();
  }

  #renderLog(): void {
    const fragment = document.createDocumentFragment();

    for (const entry of this.#logEntries.slice(0, 80)) {
      const item = document.createElement("li");
      item.className = "log-entry";

      const time = document.createElement("time");
      time.className = "log-time";
      time.dateTime = entry.datetime;
      time.textContent = entry.timestamp;

      const body = document.createElement("span");
      body.className = "log-message";
      body.textContent = entry.message;

      item.append(time, body);
      fragment.append(item);
    }

    this.#logEl.replaceChildren(fragment);
  }

  #renderFromSdk(extra: Record<string, unknown> = {}): void {
    this.#renderState({
      isConnected: this.#sdk.isConnected,
      authToken: this.#sdk.getAuthToken(),
      extensionDetails: this.#sdk.getExtensionDetails(),
      designTokens: this.#sdk.getDesignTokens(),
      pageSettings: this.#sdk.getPageSettings(),
      ...extra,
    });
  }

  #renderState(state: PlaygroundUIState): void {
    this.#stateEl.textContent = JSON.stringify(state, null, 2);
  }
}
