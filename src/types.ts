import type { ConnectionEvent } from "./events";

/** Scoped extension token issued by the parent (`authToken` on the wire). */
export interface ScopedExtensionToken {
  jwt: string;
  /** Unix expiry seconds as a string, per parent payload. */
  expires: string;
}

/** Context about the embedded extension and its host page from handshake. */
export interface ExtensionDetails {
  extensionId: string;
  tenantId: string;
  tenantDomain: string;
  /** Base URL of the parent application. */
  baseUrl: string;
  spaceId: string;
  pageId: string;
  /** BCP 47 locale from the parent. */
  locale: string;
}

/** Branding tokens from the parent for aligning extension UI. */
export interface DesignTokens {
  primaryColor: string;
  fontFamily: string;
  borderRadius: string;
}

/** Opaque page-level settings bag owned by the extension and synced with the parent. */
export type PageSettings = Record<string, unknown>;

/** Payload delivered with a successful `HANDSHAKE_ACK`. */
export interface HandshakePayload {
  authToken: ScopedExtensionToken;
  extensionDetails: ExtensionDetails;
  designTokens: DesignTokens;
  pageSettings: PageSettings | null;
}

/** Payload for `TOKEN_REFRESH` (requested or parent-pushed). */
export interface TokenRefreshPayload {
  authToken: ScopedExtensionToken;
}

/** Payload for `PAGE_SETTINGS_UPDATED` after a page settings update request. */
export interface PageSettingsUpdatedPayload {
  success: boolean;
}

/** Payload for `UPDATE_PAGE_SETTINGS` (child → parent). */
export interface UpdatePageSettingsPayload {
  settings: PageSettings;
}

/** Payload for `NAVIGATION_CHANGE` (child → parent). */
export interface NavigationChangePayload {
  path: string;
}

/** Envelope for parent/child `postMessage` traffic. */
export interface ExtensionMessage<TPayload = unknown> {
  type: ConnectionEvent | string;
  payload?: TPayload;
}

/** Options for {@link ExtensionSDK.connect} / handshake. */
export interface ConnectOptions {
  /** Handshake timeout in milliseconds (default 10_000). */
  timeoutMs?: number;
  /**
   * Enables proactive token refresh. After the handshake, the SDK reads the
   * token's Unix-seconds `expires` value and arms a one-shot timer for
   * `expires - authTokenBufferMs`; it does not run a polling interval.
   *
   * Every successful manual, automatic, or parent-pushed token update cancels
   * the previous timer and schedules a new one from the new token's expiry.
   * If an automatic request fails, it retries once after 30 seconds while the
   * same token is still current and unexpired. {@link ExtensionSDK.destroy}
   * clears the timer. Missing or invalid expiry values disable scheduling for
   * that token without failing the connection.
   *
   * Default: `false`.
   */
  authTokenAutoRefresh?: boolean;
  /**
   * How many milliseconds before token expiry the one-shot refresh timer
   * should fire. Must be finite and non-negative. If the token is already
   * inside this buffer when received, refresh is requested immediately.
   *
   * Default: `120_000` (2 minutes). Ignored unless
   * {@link authTokenAutoRefresh} is enabled.
   */
  authTokenBufferMs?: number;
}

/** Options for request/response SDK methods that wait on a parent reply. */
export interface RequestOptions {
  /** Request timeout in milliseconds (default 10_000). */
  timeoutMs?: number;
}
