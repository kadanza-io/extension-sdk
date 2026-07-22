# @kadanza/extension-sdk

Helpers for building extensions

## Install

```bash
npm install @kadanza/extension-sdk
```

## Usage

### ESM

```ts
import { createKadanzaSDK, type SDK } from "@kadanza/extension-sdk";

const sdk: SDK = createKadanzaSDK();
console.log(sdk.wip);
```

### CommonJS

```js
const { createKadanzaSDK } = require("@kadanza/extension-sdk");

const sdk = createKadanzaSDK();
console.log(sdk.wip);
```

## Local development

```bash
npm install
npm run dev      # local playground/ demo
npm run build    # emit dist/ (ESM + CJS + types)
```
