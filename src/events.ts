export const CONNECTION_EVENTS = {
  // Child -> Parent
  handshakeInit: "HANDSHAKE_INIT",
  // Parent -> Child
  handshakeAck: "HANDSHAKE_ACK",
  // Child -> Parent
  requestTokenRefresh: "REQUEST_TOKEN_REFRESH",
  // Parent -> Child
  tokenRefresh: "TOKEN_REFRESH",
  // Parent -> Child
  loadPageSettings: "LOAD_PAGE_SETTINGS",
  // Child -> Parent
  updatePageSettings: "UPDATE_PAGE_SETTINGS",
  // Parent -> Child
  pageSettingsUpdated: "PAGE_SETTINGS_UPDATED",
} as const;

export type ConnectionEvent =
  (typeof CONNECTION_EVENTS)[keyof typeof CONNECTION_EVENTS];
