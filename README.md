# @kadanza/extension-sdk

Helpers for building Kadanza extensions embedded in the parent app via iframe `postMessage`.

## Install

```bash
npm install @kadanza/extension-sdk
```

## Usage

### ESM

```ts
import { createExtensionSDK, type IExtensionSDK } from "@kadanza/extension-sdk";

const sdk: IExtensionSDK = createExtensionSDK();

const { authToken, extensionDetails, designTokens } = await sdk.connect();

sdk.onLoadPageSettings((settings) => {
  // open settings UI with values from parent
  console.log(settings);
});

const refreshed = await sdk.requestTokenRefresh();
console.log(refreshed.jwt);

await sdk.updatePageSettings({ setting1: 123 });
```

### CommonJS

```js
const { createExtensionSDK } = require("@kadanza/extension-sdk");

const sdk = createExtensionSDK();

sdk.connect().then(({ authToken }) => {
  console.log(authToken.jwt);
});
```

## API reference

Published docs: [GitHub Pages](https://kadanza-io.github.io/extension-sdk/)

## Local development

```bash
npm install
npm run dev      # Serve a playground/ setup. Use its URL for embedding in the main app
npm run build    # emit dist/ (ESM + CJS + types)
npm run docs     # generate HTML API docs under docs/api/
```
