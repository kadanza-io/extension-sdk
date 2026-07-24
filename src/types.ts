import type { ConnectionEvent } from "./events";

/** Scoped extension token issued by the parent (`authToken` on the wire). */
export interface ScopedExtensionToken {
  jwt: string;
  /** Unix expiry seconds as a string, per parent payload. */
  expires: string;
}

export interface ExtensionDetails {
  extensionId: string;
  tenantId: string;
  tenantDomain: string;
  baseUrl: string;
  spaceId: string;
  pageId: string;
  locale: string;
}

export interface DesignTokens {
  primaryColor: string;
  fontFamily: string;
  borderRadius: string;
}

export type PageSettings = Record<string, unknown>;

export interface HandshakePayload {
  authToken: ScopedExtensionToken;
  extensionDetails: ExtensionDetails;
  designTokens: DesignTokens;
  pageSettings: PageSettings | null;
}

export interface TokenRefreshPayload {
  authToken: ScopedExtensionToken;
}

export interface PageSettingsUpdatedPayload {
  success: boolean;
}

export interface ExtensionMessage<TPayload = unknown> {
  type: ConnectionEvent | string;
  payload?: TPayload;
}

export interface ConnectOptions {
  timeoutMs?: number;
}

export interface RequestOptions {
  timeoutMs?: number;
}
