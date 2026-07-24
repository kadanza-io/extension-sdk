/**
 * Wire event type strings for parent/child `postMessage` communication.
 *
 * Keys are SDK-facing names; values are the strings sent on the wire.
 * Comments mark message direction relative to the extension (child).
 */
export const CONNECTION_EVENTS = {
  /** Child → parent: start handshake. */
  handshakeInit: "HANDSHAKE_INIT",
  /** Parent → child: handshake success with auth and context. */
  handshakeAck: "HANDSHAKE_ACK",
  /** Child → parent: request a new auth token. */
  requestTokenRefresh: "REQUEST_TOKEN_REFRESH",
  /** Parent → child: new auth token (reply or push). */
  tokenRefresh: "TOKEN_REFRESH",
  /** Parent → child: open/load page settings UI with values. */
  loadPageSettings: "LOAD_PAGE_SETTINGS",
  /** Child → parent: persist updated page settings. */
  updatePageSettings: "UPDATE_PAGE_SETTINGS",
  /** Parent → child: result of a page settings update. */
  pageSettingsUpdated: "PAGE_SETTINGS_UPDATED",
} as const;

/** Union of all {@link CONNECTION_EVENTS} wire string values. */
export type ConnectionEvent =
  (typeof CONNECTION_EVENTS)[keyof typeof CONNECTION_EVENTS];
