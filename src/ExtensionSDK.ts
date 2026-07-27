import { callApi } from "./api";
import { CONNECTION_EVENTS } from "./events";
import { postToParent, subscribeToParentMessages } from "./messaging";
import { readTenantUrlFromLocation, resolveAllowedOrigin } from "./origin";
import type {
  ConnectOptions,
  DesignTokens,
  ExtensionDetails,
  ExtensionMessage,
  HandshakePayload,
  NavigationChangePayload,
  PageSettings,
  PageSettingsUpdatedPayload,
  RequestOptions,
  ScopedExtensionToken,
  TokenRefreshPayload,
  UpdatePageSettingsPayload,
} from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_AUTH_TOKEN_BUFFER_MS = 120_000;
const AUTO_REFRESH_RETRY_DELAY_MS = 30_000;
/** Largest delay `setTimeout` can reliably use in browsers. */
const MAX_TIMEOUT_MS = 2_147_483_647;

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
   * Opt-in proactive refresh can be enabled with
   * `authTokenAutoRefresh: true` (optional `authTokenBufferMs`).
   *
   * @param options - Handshake timeout and optional auth-token auto-refresh.
   * @throws {InvalidOriginError} When `tenantUrl` is missing or invalid.
   * @throws When not embedded in a parent frame, already handshaking,
   *   destroyed, or the handshake times out / returns an invalid payload.
   */
  connect(options?: ConnectOptions): Promise<HandshakePayload>;

  /**
   * Tears down listeners, proactive refresh timers, and cached state.
   * Rejects any in-flight requests. The instance cannot be reused after destroy.
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
   * Calls the Kadanza Platform API with the current connection credentials.
   *
   * The API origin is derived from the handshake `baseUrl`. Authorization and
   * tenant headers are managed by the SDK and cannot be overridden.
   *
   * @typeParam T - Expected JSON response body.
   * @param endpoint - Root-relative API path.
   * @param options - Standard fetch options.
   * @throws When not connected, the endpoint is invalid, the request fails,
   *   or the response is not successful JSON.
   */
  apiCall<T>(endpoint: string, options?: RequestInit): Promise<T>;

  /**
   * Asks the parent for a new token and waits for `TOKEN_REFRESH`.
   *
   * @param options - Optional request timeout (default 10s).
   * @throws When not connected, a refresh is already in progress,
   *   or the request times out / returns an invalid payload.
   */
  emitRequestTokenRefresh(
    options?: RequestOptions,
  ): Promise<ScopedExtensionToken>;

  /**
   * Pushes page settings to the parent and waits for `PAGE_SETTINGS_UPDATED`.
   *
   * @param payload - Update payload containing the settings object.
   * @param options - Optional request timeout (default 10s).
   * @throws When not connected, an update is already in progress,
   *   or the request times out / returns an invalid payload.
   */
  emitUpdatePageSettings(
    payload: UpdatePageSettingsPayload,
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

  /**
   * Notifies the parent that the extension's route changed.
   *
   * Wire: `NAVIGATION_CHANGE` (fire-and-forget).
   *
   * @param payload - Navigation change payload (`path` within the extension).
   * @throws When not connected or destroyed.
   */
  emitNavigationChange(payload: NavigationChangePayload): void;
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

  #authTokenAutoRefresh = false;
  #authTokenBufferMs = DEFAULT_AUTH_TOKEN_BUFFER_MS;
  #authTokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  #authTokenRefreshRetryUsed = false;

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

    this.#configureAuthTokenAutoRefresh(options);

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
      this.#clearProactiveTokenRefreshTimer();
      throw error;
    }

    return handshakePromise;
  }

  destroy(): void {
    this.#destroyed = true;
    this.#connected = false;

    this.#clearProactiveTokenRefreshTimer();
    this.#authTokenAutoRefresh = false;
    this.#authTokenRefreshRetryUsed = false;

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

  async apiCall<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    this.#assertConnected();

    return callApi<T>(
      endpoint,
      {
        baseUrl: this.#extensionDetails!.baseUrl,
        tenantDomain: this.#extensionDetails!.tenantDomain,
        token: this.#authToken!.jwt,
      },
      options,
    );
  }

  async emitRequestTokenRefresh(
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

  async emitUpdatePageSettings(
    payload: UpdatePageSettingsPayload,
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

    postToParent(CONNECTION_EVENTS.updatePageSettings, allowedOrigin, payload);
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

  emitNavigationChange(payload: NavigationChangePayload): void {
    this.#assertConnected();
    postToParent(
      CONNECTION_EVENTS.navigationChange,
      this.#allowedOrigin!,
      payload,
    );
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

    this.#authTokenRefreshRetryUsed = false;
    this.#scheduleProactiveTokenRefresh();
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

    this.#authTokenRefreshRetryUsed = false;
    this.#scheduleProactiveTokenRefresh();
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

  #configureAuthTokenAutoRefresh(options: ConnectOptions): void {
    if (options.authTokenBufferMs !== undefined) {
      if (
        !Number.isFinite(options.authTokenBufferMs) ||
        options.authTokenBufferMs < 0
      ) {
        throw new Error(
          "authTokenBufferMs must be a finite non-negative number.",
        );
      }
    }

    this.#authTokenAutoRefresh = options.authTokenAutoRefresh === true;
    this.#authTokenBufferMs =
      options.authTokenBufferMs ?? DEFAULT_AUTH_TOKEN_BUFFER_MS;
    this.#authTokenRefreshRetryUsed = false;
    this.#clearProactiveTokenRefreshTimer();
  }

  #parseExpiresAtMs(token: ScopedExtensionToken): number | null {
    const expiresSec = Number(token.expires);
    if (!Number.isFinite(expiresSec)) {
      return null;
    }
    return expiresSec * 1000;
  }

  #getProactiveRefreshDelayMs(token: ScopedExtensionToken): number | null {
    const expiresAtMs = this.#parseExpiresAtMs(token);
    if (expiresAtMs === null) {
      return null;
    }
    return Math.max(0, expiresAtMs - this.#authTokenBufferMs - Date.now());
  }

  #clearProactiveTokenRefreshTimer(): void {
    if (this.#authTokenRefreshTimer !== null) {
      clearTimeout(this.#authTokenRefreshTimer);
      this.#authTokenRefreshTimer = null;
    }
  }

  #scheduleProactiveTokenRefresh(): void {
    this.#clearProactiveTokenRefreshTimer();

    if (
      !this.#authTokenAutoRefresh ||
      !this.#connected ||
      this.#destroyed ||
      !this.#authToken
    ) {
      return;
    }

    const delayMs = this.#getProactiveRefreshDelayMs(this.#authToken);
    if (delayMs === null) {
      return;
    }

    const clampedDelay = Math.min(delayMs, MAX_TIMEOUT_MS);
    this.#authTokenRefreshTimer = setTimeout(() => {
      this.#authTokenRefreshTimer = null;
      void this.#runProactiveTokenRefresh();
    }, clampedDelay);
  }

  async #runProactiveTokenRefresh(): Promise<void> {
    if (
      !this.#authTokenAutoRefresh ||
      !this.#connected ||
      this.#destroyed ||
      !this.#authToken
    ) {
      return;
    }

    const tokenAtRequest = this.#authToken;
    const delayMs = this.#getProactiveRefreshDelayMs(tokenAtRequest);
    if (delayMs === null) {
      return;
    }

    if (delayMs > 0) {
      this.#scheduleProactiveTokenRefresh();
      return;
    }

    if (this.#pendingTokenRefresh) {
      this.#handleProactiveRefreshFailure(tokenAtRequest);
      return;
    }

    try {
      await this.emitRequestTokenRefresh();
    } catch {
      this.#handleProactiveRefreshFailure(tokenAtRequest);
    }
  }

  #handleProactiveRefreshFailure(tokenAtRequest: ScopedExtensionToken): void {
    if (
      !this.#authTokenAutoRefresh ||
      !this.#connected ||
      this.#destroyed ||
      this.#authToken?.jwt !== tokenAtRequest.jwt
    ) {
      return;
    }

    if (this.#authTokenRefreshRetryUsed) {
      return;
    }

    const expiresAtMs = this.#parseExpiresAtMs(tokenAtRequest);
    if (expiresAtMs === null) {
      return;
    }

    const remainingMs = expiresAtMs - Date.now();
    if (remainingMs <= 0) {
      return;
    }

    this.#authTokenRefreshRetryUsed = true;
    this.#clearProactiveTokenRefreshTimer();

    const retryDelay = Math.min(AUTO_REFRESH_RETRY_DELAY_MS, remainingMs);
    this.#authTokenRefreshTimer = setTimeout(() => {
      this.#authTokenRefreshTimer = null;
      void this.#runProactiveTokenRefresh();
    }, retryDelay);
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
