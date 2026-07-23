import { ExtensionSDK, type IExtensionSDK } from "./ExtensionSDK";

export { ExtensionSDK, type IExtensionSDK } from "./ExtensionSDK";

export const createExtensionSDK = (): IExtensionSDK => {
  return new ExtensionSDK();
};
