# @kadanza/extension-sdk

Helpers for building Kadanza extensions

## Quick start with AI

Fill in `<APP_NAME>` and `<EXTENSION_BUILDERS_DESCRIBE_THEIR_ADDITIONAL_FEATURE_REQUIREMENTS_HERE>`, then paste this into Cursor, Lovable, or a similar AI tool.

> You are building a Kadanza extension called "<APP_NAME>".
> It is a React + Vite + TypeScript app that uses @kadanza/extension-sdk and runs embedded in Kadanza.
>
> Before writing code, read and follow these sources of truth:
>
> - How the host embeds you: https://github.com/kadanza-io/extension-sdk/blob/main/docs/embedding.md
> - React setup and wiring: https://github.com/kadanza-io/extension-sdk/blob/main/docs/react-guide.md
> - SDK flows you must support: https://github.com/kadanza-io/extension-sdk/blob/main/docs/flows.md
>
> Do not invent your own host communication, handshake, or API auth. Prefer the patterns and APIs described in those docs over improvising.
>
> App requirements (from the builder):
> <EXTENSION_BUILDERS_DESCRIBE_THEIR_ADDITIONAL_FEATURE_REQUIREMENTS_HERE>
>
> When done, verify against the docs:
>
> - Embedding constraints in embedding.md are respected
> - Structure matches react-guide.md
> - Required flows from flows.md are implemented
> - The app requirements above are covered

## Get started

### Install

```bash
# Stable
npm install @kadanza/extension-sdk

# RC (shared testing channel on main)
npm install @kadanza/extension-sdk@rc

# Canary (feature-branch preview — see releasing docs)
npm install @kadanza/extension-sdk@canary
```

How we version and publish: [Releasing](docs/releasing.md).

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

Check [Flows.md](/docs/flows.md) for all available flows. Building with React? See [Building a React extension](/docs/react-guide.md).

## Documentation

- [Documentation folder](docs/) — This is were the important information is stored
- [How Kadanza embeds an extension](docs/embedding.md) — Host iframe, allowed origins, `tenantUrl`, and host API (`ExtensionSDKHost`)
- [Building a React extension](docs/react-guide.md) — Bootstrap a React app with the Extension SDK
- [Releasing](docs/releasing.md) — Changesets, stable and RC publishes
- [API reference](https://kadanza-io.github.io/extension-sdk/) — TypeDoc generated documentation describing all the small details, classes, interfaces, payloads...

## Local development

```bash
npm install
```

| Command                   | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `npm run dev`             | Serve the playground for embedding in the parent app |
| `npm run build`           | Emit `dist/` (ESM + CJS + types)                     |
| `npm run preview`         | Preview the production playground build              |
| `npm run docs`            | Generate HTML API docs under `docs/api/`             |
| `npm run docs:check`      | Validate TypeDoc without writing output              |
| `npm run check:types`     | Check published package types with arethetypeswrong  |
| `npm run changeset`       | Add a changeset for the next release                 |
| `npm run release:rc:enter`| Enter RC prerelease mode on `main`                   |
| `npm run release:rc:exit` | Exit RC prerelease mode                              |

`npm run dev` serves the playground at `https://localhost:5000` (accept the
self-signed certificate warning once). Use this HTTPS origin for the parent
iframe URL and add it to the API's CORS allowlist.
