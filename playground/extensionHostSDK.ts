import {
  CONNECTION_EVENTS,
  type ExtensionMessage,
  type HandshakePayload,
  type PageSettings,
  type PageSettingsUpdatedPayload,
  type ScopedExtensionToken,
} from "@kadanza/extension-sdk";

export type HostMessageDirection = "←" | "→" | "!";

export interface ExtensionHostSDKOptions {
  iframe: HTMLIFrameElement;
  allowedChildOrigins: readonly string[] | ((origin: string) => boolean);
  provideHandshakePayload: () => HandshakePayload | Promise<HandshakePayload>;
  provideScopedToken: () => ScopedExtensionToken | Promise<ScopedExtensionToken>;
  onUpdatePageSettings: (
    settings: PageSettings,
  ) => PageSettingsUpdatedPayload | Promise<PageSettingsUpdatedPayload>;
  onMessage?: (direction: HostMessageDirection, message: string) => void;
}

export interface IExtensionHostSDK {
  start(): void;
  destroy(): void;
  readonly isConnected: boolean;
  loadPageSettings(settings: PageSettings): void;
  onConnected(handler: (payload: HandshakePayload) => void): () => void;
  onDisconnected(handler: () => void): () => void;
}

function isOriginAllowed(
  origin: string,
  allowed: ExtensionHostSDKOptions["allowedChildOrigins"],
): boolean {
  if (typeof allowed === "function") {
    return allowed(origin);
  }
  return allowed.includes(origin);
}

function isExtensionMessage(data: unknown): data is ExtensionMessage {
  return !!data && typeof data === "object" && "type" in data;
}

export class ExtensionHostSDK implements IExtensionHostSDK {
  #options: ExtensionHostSDKOptions;
  #connected = false;
  #started = false;
  #destroyed = false;
  #unsubscribe: (() => void) | null = null;
  #connectedHandlers = new Set<(payload: HandshakePayload) => void>();
  #disconnectedHandlers = new Set<() => void>();

  constructor(options: ExtensionHostSDKOptions) {
    this.#options = options;
  }

  get isConnected(): boolean {
    return this.#connected;
  }

  start(): void {
    if (this.#destroyed) {
      throw new Error("Host SDK has been destroyed.");
    }
    if (this.#started) {
      return;
    }

    this.#started = true;
    const listener = (event: MessageEvent) => {
      void this.#onMessage(event);
    };
    window.addEventListener("message", listener);
    this.#unsubscribe = () => window.removeEventListener("message", listener);
  }

  destroy(): void {
    this.#destroyed = true;
    this.#started = false;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#setDisconnected();
    this.#connectedHandlers.clear();
    this.#disconnectedHandlers.clear();
  }

  loadPageSettings(settings: PageSettings): void {
    this.#postToChild(CONNECTION_EVENTS.loadPageSettings, settings);
  }

  onConnected(handler: (payload: HandshakePayload) => void): () => void {
    this.#connectedHandlers.add(handler);
    return () => {
      this.#connectedHandlers.delete(handler);
    };
  }

  onDisconnected(handler: () => void): () => void {
    this.#disconnectedHandlers.add(handler);
    return () => {
      this.#disconnectedHandlers.delete(handler);
    };
  }

  /** Call when the iframe is remounted so connection state resets. */
  resetConnection(): void {
    this.#setDisconnected();
  }

  #setDisconnected(): void {
    if (!this.#connected) {
      return;
    }
    this.#connected = false;
    for (const handler of this.#disconnectedHandlers) {
      handler();
    }
  }

  #log(direction: HostMessageDirection, message: string): void {
    this.#options.onMessage?.(direction, message);
  }

  #postToChild(type: string, payload?: unknown): void {
    const target = this.#options.iframe.contentWindow;
    if (!target) {
      this.#log("!", "iframe contentWindow unavailable");
      return;
    }

    const targetOrigin = window.location.origin;
    const message: ExtensionMessage =
      payload === undefined ? { type } : { type, payload };
    target.postMessage(message, targetOrigin);
    this.#log(
      "→",
      `${type} ${payload === undefined ? "" : JSON.stringify(payload)}`.trim(),
    );
  }

  #isValidChildMessage(event: MessageEvent): boolean {
    return (
      event.source === this.#options.iframe.contentWindow &&
      isOriginAllowed(event.origin, this.#options.allowedChildOrigins) &&
      isExtensionMessage(event.data)
    );
  }

  async #onMessage(event: MessageEvent): Promise<void> {
    if (!this.#isValidChildMessage(event)) {
      return;
    }

    const message = event.data as ExtensionMessage;
    this.#log(
      "←",
      `${message.type} ${message.payload === undefined ? "" : JSON.stringify(message.payload)}`.trim(),
    );

    switch (message.type) {
      case CONNECTION_EVENTS.handshakeInit: {
        const payload = await this.#options.provideHandshakePayload();
        this.#connected = true;
        for (const handler of this.#connectedHandlers) {
          handler(payload);
        }
        this.#postToChild(CONNECTION_EVENTS.handshakeAck, payload);
        break;
      }
      case CONNECTION_EVENTS.requestTokenRefresh: {
        const authToken = await this.#options.provideScopedToken();
        this.#postToChild(CONNECTION_EVENTS.tokenRefresh, { authToken });
        break;
      }
      case CONNECTION_EVENTS.updatePageSettings: {
        const settings =
          typeof message.payload === "object" && message.payload !== null
            ? (message.payload as PageSettings)
            : {};
        const result = await this.#options.onUpdatePageSettings(settings);
        this.#postToChild(CONNECTION_EVENTS.pageSettingsUpdated, result);
        break;
      }
      default:
        this.#log("!", `ignored child event ${String(message.type)}`);
        break;
    }
  }
}

export function createExtensionHostSDK(
  options: ExtensionHostSDKOptions,
): ExtensionHostSDK {
  return new ExtensionHostSDK(options);
}

export function buildExtensionIframeSrc(
  extensionUrl: string,
  tenantUrl: string = window.location.origin,
): string {
  const src = new URL(extensionUrl, window.location.origin);
  src.searchParams.set("tenantUrl", tenantUrl);
  return src.toString();
}
