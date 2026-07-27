import { ExtensionSDK, type IExtensionSDK } from "./ExtensionSDK";

export { ExtensionSDK, type IExtensionSDK } from "./ExtensionSDK";
export { CONNECTION_EVENTS, type ConnectionEvent } from "./events";
export {
  InvalidOriginError,
  readTenantUrlFromLocation,
  resolveAllowedOrigin,
} from "./origin";
export type {
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

/** Creates a new {@link IExtensionSDK} instance for the current extension frame. */
export const createExtensionSDK = (): IExtensionSDK => {
  return new ExtensionSDK();
};
