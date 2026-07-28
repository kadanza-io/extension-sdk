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

let instance: IExtensionSDK | null = null;
let hasWarnedDuplicateCreate = false;

/** Clears the factory singleton when the managed instance is destroyed. */
class ManagedExtensionSDK extends ExtensionSDK {
  destroy(): void {
    super.destroy();
    if (instance === this) {
      instance = null;
      hasWarnedDuplicateCreate = false;
    }
  }
}

/**
 * Returns the shared {@link IExtensionSDK} for the current extension frame.
 *
 * Creates the instance on first call. Later calls return the same instance and
 * log a console warning — use the SDK once per app. After {@link IExtensionSDK.destroy},
 * the next call creates a fresh instance.
 */
export const createExtensionSDK = (): IExtensionSDK => {
  if (instance) {
    if (!hasWarnedDuplicateCreate) {
      console.warn(
        `[${__PACKAGE_NAME__}] createExtensionSDK() was called more than once. ` +
          "The SDK is a singleton — reuse the same instance for the whole app.",
      );
      hasWarnedDuplicateCreate = true;
    }
    return instance;
  }

  instance = new ManagedExtensionSDK();
  return instance;
};
