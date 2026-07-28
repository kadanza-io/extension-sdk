# @kadanza/extension-sdk

Helpers for building Kadanza extensions

## Get started

### Install

```bash
npm install @kadanza/extension-sdk
```

### Usage

```ts
// For ESM
import { createExtensionSDK, type IExtensionSDK } from "@kadanza/extension-sdk";
// For CommonJS
// const { createExtensionSDK } = require("@kadanza/extension-sdk");

const sdk: IExtensionSDK = createExtensionSDK();

// Handshake flow
const { authToken, extensionDetails, designTokens } = await sdk.connect();
```

Create and use the SDK once per app. Later `createExtensionSDK()` calls return the same instance.

Check [Flows.md](/docs/flows.md) for all available flows. Building with React? See [Building a React extension](/docs/react.md).

## Documentation

- [Documentation folder](docs/) — This is were the important information is stored
- [Building a React extension](docs/react.md) — Bootstrap the SDK in a React app
- [API reference](https://kadanza-io.github.io/extension-sdk/) — TypeDoc generated documentation describing all the small details, classes, interfaces, payloads...

## Local development

```bash
npm install
```

| Command               | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `npm run dev`         | Serve the playground for embedding in the parent app |
| `npm run build`       | Emit `dist/` (ESM + CJS + types)                     |
| `npm run preview`     | Preview the production playground build              |
| `npm run docs`        | Generate HTML API docs under `docs/api/`             |
| `npm run docs:check`  | Validate TypeDoc without writing output              |
| `npm run check:types` | Check published package types with arethetypeswrong  |

`npm run dev` serves the playground at `https://localhost:5000` (accept the
self-signed certificate warning once). Use this HTTPS origin for the parent
iframe URL and add it to the API's CORS allowlist.
