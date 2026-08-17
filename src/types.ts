import type { ConnectionEvent } from "./events";

/** Auth token issued by the parent (`authToken` on the wire). */
export interface AuthToken {
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

/**
 * How the extension handles in-app routing.
 *
 * - `server` — full document loads (iframe `src` reload). Default.
 * - `client-hash` — hash router SPA; supports soft navigation via
 *   `REQUEST_NAVIGATION_CHANGE` / `NAVIGATION_CHANGE`.
 */
export type RoutingType = "server" | "client-hash";

/** Default when `routingType` is omitted or unrecognized. */
export const DEFAULT_ROUTING_TYPE: RoutingType = "server";

/** Normalize a wire / option value to a known {@link RoutingType}. */
export function normalizeRoutingType(value: unknown): RoutingType {
  if (value === "client-hash") {
    return "client-hash";
  }
  return DEFAULT_ROUTING_TYPE;
}

/** Payload for `HANDSHAKE_INIT` (child → parent). */
export interface HandshakeInitPayload {
  /**
   * Declares how the extension routes. Omit or unknown → `server`.
   * Soft navigation requires `client-hash`.
   */
  routingType?: RoutingType;
}

/** Payload delivered with a successful `HANDSHAKE_ACK`. */
export interface HandshakePayload {
  authToken: AuthToken;
  extensionDetails: ExtensionDetails;
  designTokens: DesignTokens;
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

/** Payload for `REQUEST_NAVIGATION_CHANGE` (parent → child). */
export interface RequestNavigationChangePayload {
  /** Path within the extension (e.g. `/settings`). */
  path: string;
  /**
   * Query string for the target route, including the leading `?`
   * (e.g. `?tab=history`). Omitted or empty means no query.
   *
   * For `client-hash` extensions the query belongs inside the hash fragment;
   * the child SDK consumer is responsible for applying it to its router.
   */
  search?: string;
}

/** Payload for `NAVIGATION_CHANGE` (child → parent). */
export interface NavigationChangePayload {
  /** Path within the extension (e.g. `/settings`). */
  path: string;
  /**
   * Query string of the child's current route, including the leading `?`
   * (e.g. `?tab=history`). Omitted or empty means no query.
   *
   * For `client-hash` extensions the child reads this from its hash fragment,
   * not from `window.location.search`.
   */
  search?: string;
}

/**
 * Normalizes a route query string for the navigation contract.
 *
 * Returns `""` for missing / empty input, otherwise guarantees a single
 * leading `?` (e.g. `tab=1` → `?tab=1`, `?tab=1` → `?tab=1`).
 */
export function normalizeNavigationSearch(value: unknown): string {
  if (typeof value !== "string" || value === "" || value === "?") {
    return "";
  }
  return value.startsWith("?") ? value : `?${value}`;
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
   * Routing mode announced to the parent on `HANDSHAKE_INIT`.
   * HashRouter SPAs should pass `client-hash`. Default: `server`.
   */
  routingType?: RoutingType;
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
