# @kadanza/extension-sdk

Helpers for building extensions

## Install

```bash
npm install @kadanza/extension-sdk
```

## Usage

### ESM

```ts
import { createExtensionSDK, type ExtensionSDK } from "@kadanza/extension-sdk";

const sdk: ExtensionSDK = createExtensionSDK();
console.log(sdk.wip);
```

### CommonJS

```js
const { createExtensionSDK } = require("@kadanza/extension-sdk");

const sdk = createExtensionSDK();
console.log(sdk.wip);
```

## Local development

```bash
npm install
npm run dev      # local playground/ demo
npm run build    # emit dist/ (ESM + CJS + types)
```
