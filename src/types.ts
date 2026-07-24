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

/** Envelope for parent/child `postMessage` traffic. */
export interface ExtensionMessage<TPayload = unknown> {
  type: ConnectionEvent | string;
  payload?: TPayload;
}

/** Options for {@link ExtensionSDK.connect} / handshake. */
export interface ConnectOptions {
  /** Handshake timeout in milliseconds (default 10_000). */
  timeoutMs?: number;
}

/** Options for request/response SDK methods that wait on a parent reply. */
export interface RequestOptions {
  /** Request timeout in milliseconds (default 10_000). */
  timeoutMs?: number;
}
