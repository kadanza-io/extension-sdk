export interface SDK {
  wip: boolean;
}

export const createKadanzaSDK = (): SDK => {
  return {
    wip: true,
  };
};
