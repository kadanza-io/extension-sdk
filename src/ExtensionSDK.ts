export interface IExtensionSDK {
  wip: boolean;
}

export class ExtensionSDK implements IExtensionSDK {
  wip = true;

  constructor() {}
}
