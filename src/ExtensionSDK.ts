import { callApi, deriveApiUrl } from "./api";
import { CONNECTION_EVENTS } from "./events";
import { postToParent, subscribeToParentMessages } from "./messaging";
import { readTenantUrlFromLocation, resolveAllowedOrigin } from "./origin";
import type {
  AuthToken,
  AuthTokenRefreshPayload,
  ConnectOptions,
  DesignTokens,
  ExtensionDetails,
  ExtensionMessage,
  HandshakePayload,
  NavigationChangePayload,
  PageSettings,
  PageSettingsUpdatedPayload,
  RequestOptions,
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
   * Safe to call repeatedly (e.g. from a React `useEffect` with deps):
   * - Already connected: returns the cached handshake and re-applies
   *   `authTokenAutoRefresh` / `authTokenBufferMs` without another init.
   *   `timeoutMs` is ignored after connect.
   * - Handshake in progress: returns the same in-flight promise. Options from
   *   the first connecting call apply until the handshake completes.
   *
   * Opt-in proactive refresh can be enabled with
   * `authTokenAutoRefresh: true` (optional `authTokenBufferMs`).
   *
   * @param options - Handshake timeout and optional auth-token auto-refresh.
   * @throws {InvalidOriginError} When `tenantUrl` is missing or invalid.
   * @throws When not embedded in a parent frame, destroyed, or the handshake
   *   times out / returns an invalid payload.
   */
  connect(options?: ConnectOptions): Promise<HandshakePayload>;

  /**
   * Tears down listeners, proactive refresh timers, and cached state.
   * Rejects any in-flight requests. The instance cannot be reused after destroy.
   * When created via {@link createExtensionSDK}, clears the singleton so a
   * later create call can return a fresh instance.
   */
  destroy(): void;

  /** Whether a successful handshake has completed and not been destroyed. */
  readonly isConnected: boolean;

  /** Last auth token from handshake or refresh; `null` until connected. */
  getAuthToken(): AuthToken | null;

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
   * Validated parent `postMessage` origin from `tenantUrl`;
   * `null` until `connect` resolves it.
   */
  getAllowedOrigin(): string | null;

  /**
   * Raw `tenantUrl` search-param value used for the allowed origin;
   * `null` until `connect` reads it.
   */
  getTenantUrl(): string | null;

  /**
   * Platform API origin derived from handshake `baseUrl`;
   * `null` until connected.
   */
  getApiUrl(): string | null;

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
   * Asks the parent for a new auth token and waits for `TOKEN_REFRESH`.
   *
   * @param options - Optional request timeout (default 10s).
   * @throws When not connected, a refresh is already in progress,
   *   or the request times out / returns an invalid payload.
   */
  emitRequestAuthTokenRefresh(
    options?: RequestOptions,
  ): Promise<AuthToken>;

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
   * Registers a handler for auth-token updates (requested or parent-pushed).
   *
   * @returns Unsubscribe function.
   */
  onAuthTokenRefresh(handler: (authToken: AuthToken) => void): () => void;

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
  #tenantUrl: string | null = null;
  #unsubscribe: (() => void) | null = null;
  #connected = false;
  #destroyed = false;

  #authToken: AuthToken | null = null;
  #extensionDetails: ExtensionDetails | null = null;
  #designTokens: DesignTokens | null = null;
  #pageSettings: PageSettings | null = null;

  #authTokenAutoRefresh = false;
  #authTokenBufferMs = DEFAULT_AUTH_TOKEN_BUFFER_MS;
  #authTokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  #authTokenRefreshRetryUsed = false;

  #pendingHandshake: Pending<HandshakePayload> | null = null;
  #handshakePromise: Promise<HandshakePayload> | null = null;
  #pendingAuthTokenRefresh: Pending<AuthToken> | null = null;
  #pendingPageSettingsUpdate: Pending<PageSettingsUpdatedPayload> | null = null;

  #loadPageSettingsHandlers = new Set<(settings: PageSettings) => void>();
  #authTokenRefreshHandlers = new Set<(authToken: AuthToken) => void>();

  get isConnected(): boolean {
    return this.#connected;
  }

  async connect(options: ConnectOptions = {}): Promise<HandshakePayload> {
    this.#assertNotDestroyed();

    if (this.#connected && this.#authToken && this.#extensionDetails && this.#designTokens) {
      this.#configureAuthTokenAutoRefresh(options);
      this.#scheduleProactiveAuthTokenRefresh();
      return {
        authToken: this.#authToken,
        extensionDetails: this.#extensionDetails,
        designTokens: this.#designTokens,
        pageSettings: this.#pageSettings,
      };
    }

    if (this.#handshakePromise) {
      return this.#handshakePromise;
    }

    this.#configureAuthTokenAutoRefresh(options);

    const tenantUrl = readTenantUrlFromLocation();
    this.#allowedOrigin = resolveAllowedOrigin(tenantUrl);
    this.#tenantUrl = tenantUrl;

    this.#unsubscribe?.();
    this.#unsubscribe = subscribeToParentMessages(
      this.#allowedOrigin,
      (event) => this.#onMessage(event),
    );

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const handshakePromise = new Promise<HandshakePayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pendingHandshake = null;
        this.#handshakePromise = null;
        reject(new Error(`Handshake timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.#pendingHandshake = { resolve, reject, timer };
    });
    this.#handshakePromise = handshakePromise;

    try {
      postToParent(CONNECTION_EVENTS.handshakeInit, this.#allowedOrigin);
    } catch (error) {
      this.#clearPending(this.#pendingHandshake);
      this.#pendingHandshake = null;
      this.#handshakePromise = null;
      this.#unsubscribe?.();
      this.#unsubscribe = null;
      this.#allowedOrigin = null;
      this.#tenantUrl = null;
      this.#clearProactiveAuthTokenRefreshTimer();
      throw error;
    }

    return handshakePromise;
  }

  destroy(): void {
    this.#destroyed = true;
    this.#connected = false;

    this.#clearProactiveAuthTokenRefreshTimer();
    this.#authTokenAutoRefresh = false;
    this.#authTokenRefreshRetryUsed = false;

    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#allowedOrigin = null;
    this.#tenantUrl = null;

    this.#rejectPending(this.#pendingHandshake, new Error("SDK destroyed."));
    this.#rejectPending(this.#pendingAuthTokenRefresh, new Error("SDK destroyed."));
    this.#rejectPending(this.#pendingPageSettingsUpdate, new Error("SDK destroyed."));
    this.#pendingHandshake = null;
    this.#handshakePromise = null;
    this.#pendingAuthTokenRefresh = null;
    this.#pendingPageSettingsUpdate = null;

    this.#loadPageSettingsHandlers.clear();
    this.#authTokenRefreshHandlers.clear();

    this.#authToken = null;
    this.#extensionDetails = null;
    this.#designTokens = null;
    this.#pageSettings = null;
  }

  getAuthToken(): AuthToken | null {
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

  getAllowedOrigin(): string | null {
    return this.#allowedOrigin;
  }

  getTenantUrl(): string | null {
    return this.#tenantUrl;
  }

  getApiUrl(): string | null {
    if (!this.#extensionDetails) {
      return null;
    }

    return deriveApiUrl(this.#extensionDetails.baseUrl);
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
        authTokenJwt: this.#authToken!.jwt,
      },
      options,
    );
  }

  async emitRequestAuthTokenRefresh(
    options: RequestOptions = {},
  ): Promise<AuthToken> {
    this.#assertConnected();

    if (this.#pendingAuthTokenRefresh) {
      throw new Error("Auth token refresh already in progress.");
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const allowedOrigin = this.#allowedOrigin!;

    const promise = new Promise<AuthToken>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pendingAuthTokenRefresh = null;
        reject(new Error(`Auth token refresh timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.#pendingAuthTokenRefresh = { resolve, reject, timer };
    });

    postToParent(CONNECTION_EVENTS.requestAuthTokenRefresh, allowedOrigin);
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

  onAuthTokenRefresh(handler: (authToken: AuthToken) => void): () => void {
    this.#authTokenRefreshHandlers.add(handler);
    return () => {
      this.#authTokenRefreshHandlers.delete(handler);
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
      case CONNECTION_EVENTS.handshakeAck: {
        this.#handleHandshakeAck(payload as HandshakePayload | undefined);
        break;
      }
      case CONNECTION_EVENTS.authTokenRefresh: {
        this.#handleAuthTokenRefresh(payload as AuthTokenRefreshPayload | undefined);
        break;
      }
      case CONNECTION_EVENTS.loadPageSettings: {
        this.#handleLoadPageSettings(payload as PageSettings | undefined);
        break;
      }
      case CONNECTION_EVENTS.pageSettingsUpdated: {
        this.#handlePageSettingsUpdated(
          payload as PageSettingsUpdatedPayload | undefined,
        );
        break;
      }
      default: {
        break;
      }
    }
  }

  #handleHandshakeAck(payload: HandshakePayload | undefined): void {
    if (!payload?.authToken || !payload.extensionDetails || !payload.designTokens) {
      this.#rejectPending(
        this.#pendingHandshake,
        new Error("Invalid HANDSHAKE_ACK payload."),
      );
      this.#pendingHandshake = null;
      this.#handshakePromise = null;
      return;
    }

    this.#authToken = payload.authToken;
    this.#extensionDetails = payload.extensionDetails;
    this.#designTokens = payload.designTokens;
    this.#pageSettings = payload.pageSettings ?? null;
    this.#connected = true;

    const pending = this.#pendingHandshake;
    this.#pendingHandshake = null;
    this.#handshakePromise = null;
    this.#resolvePending(pending, {
      authToken: this.#authToken,
      extensionDetails: this.#extensionDetails,
      designTokens: this.#designTokens,
      pageSettings: this.#pageSettings,
    });

    this.#authTokenRefreshRetryUsed = false;
    this.#scheduleProactiveAuthTokenRefresh();
  }

  #handleAuthTokenRefresh(payload: AuthTokenRefreshPayload | undefined): void {
    if (!payload?.authToken) {
      this.#rejectPending(
        this.#pendingAuthTokenRefresh,
        new Error("Invalid TOKEN_REFRESH payload."),
      );
      this.#pendingAuthTokenRefresh = null;
      return;
    }

    this.#authToken = payload.authToken;

    const pending = this.#pendingAuthTokenRefresh;
    this.#pendingAuthTokenRefresh = null;
    this.#resolvePending(pending, this.#authToken);

    for (const handler of this.#authTokenRefreshHandlers) {
      handler(this.#authToken);
    }

    this.#authTokenRefreshRetryUsed = false;
    this.#scheduleProactiveAuthTokenRefresh();
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
    this.#clearProactiveAuthTokenRefreshTimer();
  }

  #parseExpiresAtMs(authToken: AuthToken): number | null {
    const expiresSec = Number(authToken.expires);
    if (!Number.isFinite(expiresSec)) {
      return null;
    }
    return expiresSec * 1000;
  }

  #getProactiveRefreshDelayMs(authToken: AuthToken): number | null {
    const expiresAtMs = this.#parseExpiresAtMs(authToken);
    if (expiresAtMs === null) {
      return null;
    }
    return Math.max(0, expiresAtMs - this.#authTokenBufferMs - Date.now());
  }

  #clearProactiveAuthTokenRefreshTimer(): void {
    if (this.#authTokenRefreshTimer !== null) {
      clearTimeout(this.#authTokenRefreshTimer);
      this.#authTokenRefreshTimer = null;
    }
  }

  #scheduleProactiveAuthTokenRefresh(): void {
    this.#clearProactiveAuthTokenRefreshTimer();

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
      void this.#runProactiveAuthTokenRefresh();
    }, clampedDelay);
  }

  async #runProactiveAuthTokenRefresh(): Promise<void> {
    if (
      !this.#authTokenAutoRefresh ||
      !this.#connected ||
      this.#destroyed ||
      !this.#authToken
    ) {
      return;
    }

    const authTokenAtRequest = this.#authToken;
    const delayMs = this.#getProactiveRefreshDelayMs(authTokenAtRequest);
    if (delayMs === null) {
      return;
    }

    if (delayMs > 0) {
      this.#scheduleProactiveAuthTokenRefresh();
      return;
    }

    if (this.#pendingAuthTokenRefresh) {
      this.#handleProactiveAuthTokenRefreshFailure(authTokenAtRequest);
      return;
    }

    try {
      await this.emitRequestAuthTokenRefresh();
    } catch {
      this.#handleProactiveAuthTokenRefreshFailure(authTokenAtRequest);
    }
  }

  #handleProactiveAuthTokenRefreshFailure(authTokenAtRequest: AuthToken): void {
    if (
      !this.#authTokenAutoRefresh ||
      !this.#connected ||
      this.#destroyed ||
      this.#authToken?.jwt !== authTokenAtRequest.jwt
    ) {
      return;
    }

    if (this.#authTokenRefreshRetryUsed) {
      return;
    }

    const expiresAtMs = this.#parseExpiresAtMs(authTokenAtRequest);
    if (expiresAtMs === null) {
      return;
    }

    const remainingMs = expiresAtMs - Date.now();
    if (remainingMs <= 0) {
      return;
    }

    this.#authTokenRefreshRetryUsed = true;
    this.#clearProactiveAuthTokenRefreshTimer();

    const retryDelay = Math.min(AUTO_REFRESH_RETRY_DELAY_MS, remainingMs);
    this.#authTokenRefreshTimer = setTimeout(() => {
      this.#authTokenRefreshTimer = null;
      void this.#runProactiveAuthTokenRefresh();
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
