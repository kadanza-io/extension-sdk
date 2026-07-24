import { CONNECTION_EVENTS } from "./events";
import { postToParent, subscribeToParentMessages } from "./messaging";
import { readTenantUrlFromLocation, resolveAllowedOrigin } from "./origin";
import type {
  ConnectOptions,
  DesignTokens,
  ExtensionDetails,
  ExtensionMessage,
  HandshakePayload,
  PageSettings,
  PageSettingsUpdatedPayload,
  RequestOptions,
  ScopedExtensionToken,
  TokenRefreshPayload,
} from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Public contract for talking to the Kadanza parent frame over `postMessage`.
 *
 * Requires a `tenantUrl` search param on the extension URL so
 * {@link connect} can validate the parent origin.
 */
export interface IExtensionSDK {
  /**
   * Establishes the parent connection and waits for `HANDSHAKE_ACK`.
   *
   * If already connected with cached handshake data, returns that payload
   * without sending another init. Concurrent calls while a handshake is
   * in progress throw.
   *
   * @param options - Optional handshake timeout (default 10s).
   * @throws {InvalidOriginError} When `tenantUrl` is missing or invalid.
   * @throws When not embedded in a parent frame, already handshaking,
   *   destroyed, or the handshake times out / returns an invalid payload.
   */
  connect(options?: ConnectOptions): Promise<HandshakePayload>;

  /**
   * Tears down listeners and cached state. Rejects any in-flight requests.
   * The instance cannot be reused after destroy.
   */
  destroy(): void;

  /** Whether a successful handshake has completed and not been destroyed. */
  readonly isConnected: boolean;

  /** Last auth token from handshake or refresh; `null` until connected. */
  getAuthToken(): ScopedExtensionToken | null;

  /** Extension context from handshake; `null` until connected. */
  getExtensionDetails(): ExtensionDetails | null;

  /** Design tokens from handshake; `null` until connected. */
  getDesignTokens(): DesignTokens | null;

  /**
   * Latest page settings from handshake or `LOAD_PAGE_SETTINGS`;
   * `null` until set.
   */
  getPageSettings(): PageSettings | null;

  /**
   * Asks the parent for a new token and waits for `TOKEN_REFRESH`.
   *
   * @param options - Optional request timeout (default 10s).
   * @throws When not connected, a refresh is already in progress,
   *   or the request times out / returns an invalid payload.
   */
  requestTokenRefresh(options?: RequestOptions): Promise<ScopedExtensionToken>;

  /**
   * Pushes page settings to the parent and waits for `PAGE_SETTINGS_UPDATED`.
   *
   * @param settings - Settings object to send.
   * @param options - Optional request timeout (default 10s).
   * @throws When not connected, an update is already in progress,
   *   or the request times out / returns an invalid payload.
   */
  updatePageSettings(
    settings: PageSettings,
    options?: RequestOptions,
  ): Promise<PageSettingsUpdatedPayload>;

  /**
   * Registers a handler for parent-initiated `LOAD_PAGE_SETTINGS`.
   *
   * @returns Unsubscribe function.
   */
  onLoadPageSettings(handler: (settings: PageSettings) => void): () => void;

  /**
   * Registers a handler for token updates (requested or parent-pushed).
   *
   * @returns Unsubscribe function.
   */
  onTokenRefresh(handler: (token: ScopedExtensionToken) => void): () => void;
}

type Pending<T> = {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** Default {@link IExtensionSDK} implementation. Prefer {@link createExtensionSDK}. */
export class ExtensionSDK implements IExtensionSDK {
  #allowedOrigin: string | null = null;
  #unsubscribe: (() => void) | null = null;
  #connected = false;
  #destroyed = false;

  #authToken: ScopedExtensionToken | null = null;
  #extensionDetails: ExtensionDetails | null = null;
  #designTokens: DesignTokens | null = null;
  #pageSettings: PageSettings | null = null;

  #pendingHandshake: Pending<HandshakePayload> | null = null;
  #pendingTokenRefresh: Pending<ScopedExtensionToken> | null = null;
  #pendingPageSettingsUpdate: Pending<PageSettingsUpdatedPayload> | null = null;

  #loadPageSettingsHandlers = new Set<(settings: PageSettings) => void>();
  #tokenRefreshHandlers = new Set<(token: ScopedExtensionToken) => void>();

  get isConnected(): boolean {
    return this.#connected;
  }

  async connect(options: ConnectOptions = {}): Promise<HandshakePayload> {
    this.#assertNotDestroyed();

    if (this.#connected && this.#authToken && this.#extensionDetails && this.#designTokens) {
      return {
        authToken: this.#authToken,
        extensionDetails: this.#extensionDetails,
        designTokens: this.#designTokens,
        pageSettings: this.#pageSettings,
      };
    }

    if (this.#pendingHandshake) {
      throw new Error("Handshake already in progress.");
    }

    const tenantUrl = readTenantUrlFromLocation();
    this.#allowedOrigin = resolveAllowedOrigin(tenantUrl);

    this.#unsubscribe?.();
    this.#unsubscribe = subscribeToParentMessages(
      this.#allowedOrigin,
      (event) => this.#onMessage(event),
    );

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const handshakePromise = new Promise<HandshakePayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pendingHandshake = null;
        reject(new Error(`Handshake timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.#pendingHandshake = { resolve, reject, timer };
    });

    try {
      postToParent(CONNECTION_EVENTS.handshakeInit, this.#allowedOrigin);
    } catch (error) {
      this.#clearPending(this.#pendingHandshake);
      this.#pendingHandshake = null;
      this.#unsubscribe?.();
      this.#unsubscribe = null;
      this.#allowedOrigin = null;
      throw error;
    }

    return handshakePromise;
  }

  destroy(): void {
    this.#destroyed = true;
    this.#connected = false;

    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#allowedOrigin = null;

    this.#rejectPending(this.#pendingHandshake, new Error("SDK destroyed."));
    this.#rejectPending(this.#pendingTokenRefresh, new Error("SDK destroyed."));
    this.#rejectPending(this.#pendingPageSettingsUpdate, new Error("SDK destroyed."));
    this.#pendingHandshake = null;
    this.#pendingTokenRefresh = null;
    this.#pendingPageSettingsUpdate = null;

    this.#loadPageSettingsHandlers.clear();
    this.#tokenRefreshHandlers.clear();

    this.#authToken = null;
    this.#extensionDetails = null;
    this.#designTokens = null;
    this.#pageSettings = null;
  }

  getAuthToken(): ScopedExtensionToken | null {
    return this.#authToken;
  }

  getExtensionDetails(): ExtensionDetails | null {
    return this.#extensionDetails;
  }

  getDesignTokens(): DesignTokens | null {
    return this.#designTokens;
  }

  getPageSettings(): PageSettings | null {
    return this.#pageSettings;
  }

  async requestTokenRefresh(
    options: RequestOptions = {},
  ): Promise<ScopedExtensionToken> {
    this.#assertConnected();

    if (this.#pendingTokenRefresh) {
      throw new Error("Token refresh already in progress.");
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const allowedOrigin = this.#allowedOrigin!;

    const promise = new Promise<ScopedExtensionToken>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pendingTokenRefresh = null;
        reject(new Error(`Token refresh timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.#pendingTokenRefresh = { resolve, reject, timer };
    });

    postToParent(CONNECTION_EVENTS.requestTokenRefresh, allowedOrigin);
    return promise;
  }

  async updatePageSettings(
    settings: PageSettings,
    options: RequestOptions = {},
  ): Promise<PageSettingsUpdatedPayload> {
    this.#assertConnected();

    if (this.#pendingPageSettingsUpdate) {
      throw new Error("Page settings update already in progress.");
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const allowedOrigin = this.#allowedOrigin!;

    const promise = new Promise<PageSettingsUpdatedPayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pendingPageSettingsUpdate = null;
        reject(new Error(`Page settings update timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.#pendingPageSettingsUpdate = { resolve, reject, timer };
    });

    postToParent(CONNECTION_EVENTS.updatePageSettings, allowedOrigin, settings);
    return promise;
  }

  onLoadPageSettings(handler: (settings: PageSettings) => void): () => void {
    this.#loadPageSettingsHandlers.add(handler);
    return () => {
      this.#loadPageSettingsHandlers.delete(handler);
    };
  }

  onTokenRefresh(handler: (token: ScopedExtensionToken) => void): () => void {
    this.#tokenRefreshHandlers.add(handler);
    return () => {
      this.#tokenRefreshHandlers.delete(handler);
    };
  }

  #onMessage(event: MessageEvent<ExtensionMessage>): void {
    const { type, payload } = event.data;

    switch (type) {
      case CONNECTION_EVENTS.handshakeAck:
        this.#handleHandshakeAck(payload as HandshakePayload | undefined);
        break;
      case CONNECTION_EVENTS.tokenRefresh:
        this.#handleTokenRefresh(payload as TokenRefreshPayload | undefined);
        break;
      case CONNECTION_EVENTS.loadPageSettings:
        this.#handleLoadPageSettings(payload as PageSettings | undefined);
        break;
      case CONNECTION_EVENTS.pageSettingsUpdated:
        this.#handlePageSettingsUpdated(
          payload as PageSettingsUpdatedPayload | undefined,
        );
        break;
      default:
        break;
    }
  }

  #handleHandshakeAck(payload: HandshakePayload | undefined): void {
    if (!payload?.authToken || !payload.extensionDetails || !payload.designTokens) {
      this.#rejectPending(
        this.#pendingHandshake,
        new Error("Invalid HANDSHAKE_ACK payload."),
      );
      this.#pendingHandshake = null;
      return;
    }

    this.#authToken = payload.authToken;
    this.#extensionDetails = payload.extensionDetails;
    this.#designTokens = payload.designTokens;
    this.#pageSettings = payload.pageSettings ?? null;
    this.#connected = true;

    const pending = this.#pendingHandshake;
    this.#pendingHandshake = null;
    this.#resolvePending(pending, {
      authToken: this.#authToken,
      extensionDetails: this.#extensionDetails,
      designTokens: this.#designTokens,
      pageSettings: this.#pageSettings,
    });
  }

  #handleTokenRefresh(payload: TokenRefreshPayload | undefined): void {
    if (!payload?.authToken) {
      this.#rejectPending(
        this.#pendingTokenRefresh,
        new Error("Invalid TOKEN_REFRESH payload."),
      );
      this.#pendingTokenRefresh = null;
      return;
    }

    this.#authToken = payload.authToken;

    const pending = this.#pendingTokenRefresh;
    this.#pendingTokenRefresh = null;
    this.#resolvePending(pending, this.#authToken);

    for (const handler of this.#tokenRefreshHandlers) {
      handler(this.#authToken);
    }
  }

  #handleLoadPageSettings(payload: PageSettings | undefined): void {
    const settings = payload ?? {};
    this.#pageSettings = settings;

    for (const handler of this.#loadPageSettingsHandlers) {
      handler(settings);
    }
  }

  #handlePageSettingsUpdated(
    payload: PageSettingsUpdatedPayload | undefined,
  ): void {
    if (!payload || typeof payload.success !== "boolean") {
      this.#rejectPending(
        this.#pendingPageSettingsUpdate,
        new Error("Invalid PAGE_SETTINGS_UPDATED payload."),
      );
      this.#pendingPageSettingsUpdate = null;
      return;
    }

    const pending = this.#pendingPageSettingsUpdate;
    this.#pendingPageSettingsUpdate = null;
    this.#resolvePending(pending, payload);
  }

  #assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new Error("SDK has been destroyed.");
    }
  }

  #assertConnected(): void {
    this.#assertNotDestroyed();
    if (!this.#connected || !this.#allowedOrigin) {
      throw new Error("SDK is not connected. Call connect() first.");
    }
  }

  #clearPending(pending: { timer: ReturnType<typeof setTimeout> } | null): void {
    if (pending) {
      clearTimeout(pending.timer);
    }
  }

  #resolvePending<T>(pending: Pending<T> | null, value: T): void {
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    pending.resolve(value);
  }

  #rejectPending(
    pending: { timer: ReturnType<typeof setTimeout>; reject: (reason?: unknown) => void } | null,
    reason: unknown,
  ): void {
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    pending.reject(reason);
  }
}
