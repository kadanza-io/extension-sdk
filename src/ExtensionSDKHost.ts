import { CONNECTION_EVENTS } from "./events";
import { postToChild, subscribeToChildMessages } from "./hostMessaging";
import { PendingRequest } from "./PendingRequest";
import type {
  AuthToken,
  ExtensionMessage,
  HandshakeInitPayload,
  HandshakePayload,
  NavigationChangePayload,
  PageSettings,
  PageSettingsUpdatedPayload,
  RequestNavigationChangePayload,
  RequestOptions,
  RoutingType,
  UpdatePageSettingsPayload,
} from "./types";
import { DEFAULT_ROUTING_TYPE, normalizeRoutingType } from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Options for {@link ExtensionSDKHost}.
 *
 * Platform code supplies token minting and page-settings persistence via
 * callbacks; the host owns only the postMessage protocol.
 */
export interface ExtensionSDKHostOptions {
  /** Returns the iframe `contentWindow`, or `null` if not ready. */
  getContentWindow: () => Window | null;
  /** Extension origin used as `postMessage` targetOrigin / source filter. */
  origin: string;
  /**
   * Builds the handshake payload (including auth token) when the child sends
   * `HANDSHAKE_INIT`.
   */
  resolveHandshakePayload: () => HandshakePayload | Promise<HandshakePayload>;
  /**
   * Resolves a fresh auth token when the child sends `REQUEST_TOKEN_REFRESH`.
   */
  resolveAuthToken: () => AuthToken | Promise<AuthToken>;
  /**
   * Persists page settings from `UPDATE_PAGE_SETTINGS`.
   * Return `true` on success; the host emits `PAGE_SETTINGS_UPDATED`.
   */
  onUpdatePageSettings?: (
    settings: PageSettings,
  ) => boolean | Promise<boolean>;
  /**
   * Called when the child reports a route change via `NAVIGATION_CHANGE`
   * (spontaneous or as ACK to {@link IExtensionSDKHost.requestNavigationChange}).
   */
  onNavigationChange?: (payload: NavigationChangePayload) => void;
}

/**
 * Parent-frame counterpart to {@link IExtensionSDK}.
 *
 * Listens for child messages and replies with the shared wire protocol.
 * Create one instance per iframe.
 */
export interface IExtensionSDKHost {
  /**
   * Attaches the child message listener. Safe to call once; no-ops if already
   * started or destroyed.
   */
  start(): void;

  /**
   * Tears down the listener. The instance cannot be restarted after destroy.
   */
  destroy(): void;

  /**
   * Routing type from the last `HANDSHAKE_INIT`. Defaults to `server` until
   * the child connects (and for omit / unrecognized values).
   */
  getRoutingType(): RoutingType;

  /**
   * Asks the child to open page settings UI with the given values.
   *
   * Wire: `LOAD_PAGE_SETTINGS` (fire-and-forget).
   */
  emitLoadPageSettings(settings: PageSettings | null): void;

  /**
   * Asks the child SPA to navigate to `payload.path` without reloading the
   * iframe. Resolves when the child ACKs with a matching `NAVIGATION_CHANGE`.
   *
   * Soft navigation is intended for `client-hash` extensions; the host decides
   * whether to call this or fall back to an iframe `src` reload.
   *
   * @param payload - Target path within the extension.
   * @param options - Optional request timeout (default 10s).
   * @throws When destroyed, a request is already in progress, the payload is
   *   invalid, or the request times out.
   */
  requestNavigationChange(
    payload: RequestNavigationChangePayload,
    options?: RequestOptions,
  ): Promise<NavigationChangePayload>;
}

/** Default {@link IExtensionSDKHost} implementation. */
export class ExtensionSDKHost implements IExtensionSDKHost {
  #options: ExtensionSDKHostOptions;
  #unsubscribe: (() => void) | null = null;
  #started = false;
  #destroyed = false;
  #routingType: RoutingType = DEFAULT_ROUTING_TYPE;
  #pendingNavigationChange: PendingRequest<
    NavigationChangePayload,
    string
  > | null = null;

  constructor(options: ExtensionSDKHostOptions) {
    this.#options = options;
  }

  start(): void {
    if (this.#destroyed || this.#started) {
      return;
    }

    this.#unsubscribe = subscribeToChildMessages(
      this.#options.origin,
      (event) => {
        void this.#onMessage(event);
      },
    );
    this.#started = true;
  }

  destroy(): void {
    this.#destroyed = true;
    this.#started = false;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#routingType = DEFAULT_ROUTING_TYPE;
    this.#pendingNavigationChange?.reject(
      new Error("ExtensionSDKHost has been destroyed."),
    );
    this.#pendingNavigationChange = null;
  }

  getRoutingType(): RoutingType {
    return this.#routingType;
  }

  emitLoadPageSettings(settings: PageSettings | null): void {
    this.#assertNotDestroyed();
    this.#post(CONNECTION_EVENTS.loadPageSettings, settings);
  }

  async requestNavigationChange(
    payload: RequestNavigationChangePayload,
    options: RequestOptions = {},
  ): Promise<NavigationChangePayload> {
    this.#assertNotDestroyed();

    if (!payload || typeof payload.path !== "string") {
      throw new Error("Invalid REQUEST_NAVIGATION_CHANGE payload.");
    }

    if (this.#pendingNavigationChange) {
      throw new Error("Navigation change request already in progress.");
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const pending = PendingRequest.create<NavigationChangePayload, string>({
      timeoutMs,
      timeoutMessage: `Navigation change timed out after ${timeoutMs}ms.`,
      context: payload.path,
      onSettle: () => {
        if (this.#pendingNavigationChange === pending) {
          this.#pendingNavigationChange = null;
        }
      },
    });
    this.#pendingNavigationChange = pending;

    this.#post(CONNECTION_EVENTS.requestNavigationChange, payload);
    return pending.promise;
  }

  async #onMessage(event: MessageEvent<ExtensionMessage>): Promise<void> {
    if (this.#destroyed) {
      return;
    }

    const { type, payload } = event.data;

    switch (type) {
      case CONNECTION_EVENTS.handshakeInit: {
        await this.#handleHandshakeInit(
          payload as HandshakeInitPayload | undefined,
        );
        break;
      }
      case CONNECTION_EVENTS.requestAuthTokenRefresh: {
        await this.#handleAuthTokenRefresh();
        break;
      }
      case CONNECTION_EVENTS.updatePageSettings: {
        await this.#handleUpdatePageSettings(
          payload as UpdatePageSettingsPayload | undefined,
        );
        break;
      }
      case CONNECTION_EVENTS.navigationChange: {
        this.#handleNavigationChange(
          payload as NavigationChangePayload | undefined,
        );
        break;
      }
      default: {
        break;
      }
    }
  }

  async #handleHandshakeInit(
    payload: HandshakeInitPayload | undefined,
  ): Promise<void> {
    this.#routingType = normalizeRoutingType(payload?.routingType);

    try {
      const handshakePayload = await this.#options.resolveHandshakePayload();
      if (this.#destroyed) {
        return;
      }
      this.#post(CONNECTION_EVENTS.handshakeAck, handshakePayload);
    } catch {
      // Platform owns error UI / retry; do not reply with a partial ACK.
    }
  }

  async #handleAuthTokenRefresh(): Promise<void> {
    try {
      const authToken = await this.#options.resolveAuthToken();
      if (this.#destroyed) {
        return;
      }
      this.#post(CONNECTION_EVENTS.authTokenRefresh, { authToken });
    } catch {
      // Platform owns error UI / retry; do not reply with an invalid token.
    }
  }

  async #handleUpdatePageSettings(
    payload: UpdatePageSettingsPayload | undefined,
  ): Promise<void> {
    const settings = payload?.settings;
    if (!settings || typeof settings !== "object") {
      this.#postPageSettingsUpdated(false);
      return;
    }

    const handler = this.#options.onUpdatePageSettings;
    if (!handler) {
      this.#postPageSettingsUpdated(false);
      return;
    }

    try {
      const success = await handler(settings);
      if (this.#destroyed) {
        return;
      }
      this.#postPageSettingsUpdated(Boolean(success));
    } catch {
      if (this.#destroyed) {
        return;
      }
      this.#postPageSettingsUpdated(false);
    }
  }

  #handleNavigationChange(payload: NavigationChangePayload | undefined): void {
    if (!payload || typeof payload.path !== "string") {
      return;
    }

    if (
      this.#pendingNavigationChange?.matches((path) => path === payload.path)
    ) {
      this.#pendingNavigationChange.resolve(payload);
    }

    this.#options.onNavigationChange?.(payload);
  }

  #postPageSettingsUpdated(success: boolean): void {
    const payload: PageSettingsUpdatedPayload = { success };
    this.#post(CONNECTION_EVENTS.pageSettingsUpdated, payload);
  }

  #post(
    type: (typeof CONNECTION_EVENTS)[keyof typeof CONNECTION_EVENTS],
    payload?: unknown,
  ): void {
    const contentWindow = this.#options.getContentWindow();
    if (!contentWindow) {
      return;
    }
    postToChild(contentWindow, this.#options.origin, type, payload);
  }

  #assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new Error("ExtensionSDKHost has been destroyed.");
    }
  }
}
