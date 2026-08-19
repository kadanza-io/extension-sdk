import type { ConnectionEvent } from "./events";

/** Auth token issued by the parent (`authToken` on the wire). */
export interface AuthToken {
  jwt: string;
  /** Unix expiry seconds as a string, per parent payload. */
  expires: string;
}

/**
 * Host context from handshake. Only set when the parent includes it.
 *
 * Field availability depends on where the iframe is mounted:
 * - Experience Pages typically send `spaceId` and `pageId`.
 * - Admin Console Pages typically omit those — there is no space page.
 *
 * Other identity fields are sent when the host knows them. Handshake does not
 * require this object.
 */
export interface ExtensionDetails {
  extensionId?: string;
  tenantId?: string;
  tenantDomain?: string;
  /** Base URL of the parent application (used to derive the Platform API origin). */
  baseUrl?: string;
  /** Space that owns the Experience Page. Omitted in Admin Console. */
  spaceId?: string;
  /** Experience Page id. Omitted in Admin Console. */
  pageId?: string;
  /** BCP 47 locale from the parent. */
  locale?: string;
}

/**
 * Tenant branding from the parent, for aligning extension UI with the host.
 *
 * The host should send this whenever a tenant is in context (Experience Pages
 * and Admin Console). Handshake still succeeds if it is omitted — treat every
 * field as optional.
 *
 * - `primaryColor` — tenant palette primary; accents, buttons, links
 * - `fontFamily` — tenant font family; body and UI type
 * - `borderRadius` — tenant roundness; controls and cards
 *
 * Values may be missing when the tenant has no setting configured.
 */
export interface DesignTokens {
  primaryColor?: string;
  fontFamily?: string;
  borderRadius?: string;
}

/** Opaque page-level settings bag owned by the extension and synced with the parent. */
export type PageSettings = Record<string, unknown>;

/**
 * Context delivered with `HANDSHAKE_ACK`.
 *
 * Handshake completes as soon as the parent ACKs. Every property is optional
 * and only populated when that host surface provides it. After `connect()`,
 * omitted wire fields are normalized to `null`.
 */
export interface HandshakePayload {
  authToken: AuthToken | null;
  extensionDetails: ExtensionDetails | null;
  designTokens: DesignTokens | null;
  pageSettings: PageSettings | null;
}

/** Payload for `TOKEN_REFRESH` (requested or parent-pushed). */
export interface AuthTokenRefreshPayload {
  authToken: AuthToken;
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
   * Enables proactive auth-token refresh. After the handshake, the SDK reads
   * the auth token's Unix-seconds `expires` value and arms a one-shot timer
   * for `expires - authTokenBufferMs`; it does not run a polling interval.
   *
   * Every successful manual, automatic, or parent-pushed auth-token update
   * cancels the previous timer and schedules a new one from the new auth
   * auth token's expiry. If an automatic request fails, it retries once after 30
   * seconds while the same auth token is still current and unexpired.
   * {@link ExtensionSDK.destroy} clears the timer. Missing or invalid expiry
   * values disable scheduling for that auth token without failing the
   * connection.
   *
   * Default: `false`.
   */
  authTokenAutoRefresh?: boolean;
  /**
   * How many milliseconds before auth-token expiry the one-shot refresh timer
   * should fire. Must be finite and non-negative. If the auth token is already
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
