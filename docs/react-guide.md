# Building a React extension

Minimal pattern for wiring `@kadanza/extension-sdk` into a React app. Protocol details live in [Flows](flows.md).

## Setup

```bash
npm create vite@latest my-extension -- --template react-ts
cd my-extension
npm install @kadanza/extension-sdk react-router-dom
```

Use **`HashRouter`**, not `BrowserRouter`. The host adds `tenantUrl` to the iframe query string; hash routing keeps that query intact while your app navigates. Pass `routingType: "client-hash"` on `connect` so the parent can soft-navigate without reloading the iframe.

## KadanzaExtensionSDKProvider

Create a provider that owns the SDK singleton, connects once, and exposes the handshake to the tree:

```tsx
// KadanzaExtensionSDKContext.tsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  createExtensionSDK,
  type HandshakePayload,
  type IExtensionSDK,
} from "@kadanza/extension-sdk";

interface KadanzaExtensionSDKContextValue {
  sdk: IExtensionSDK;
  handshake: HandshakePayload | null;
  error: Error | null;
}

const KadanzaExtensionSDKContext =
  createContext<KadanzaExtensionSDKContextValue | null>(null);

export function KadanzaExtensionSDKProvider({
  children,
}: {
  children: ReactNode;
}) {
  const sdk = createExtensionSDK();
  const [handshake, setHandshake] = useState<HandshakePayload | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function connectToParent() {
      try {
        const payload = await sdk.connect({
          routingType: "client-hash",
          authTokenAutoRefresh: true,
        });

        if (cancelled) {
          return;
        }

        setHandshake(payload);
      } catch (err) {
        if (cancelled) {
          return;
        }

        if (err instanceof Error) {
          setError(err);
        } else {
          setError(new Error(String(err)));
        }
      }
    }

    connectToParent();

    return () => {
      cancelled = true;
    };
  }, [sdk]);

  useEffect(() => {
    function onPageHide() {
      sdk.destroy();
    }

    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [sdk]);

  return (
    <KadanzaExtensionSDKContext.Provider value={{ sdk, handshake, error }}>
      {children}
    </KadanzaExtensionSDKContext.Provider>
  );
}

export function useKadanzaExtensionSDK(): KadanzaExtensionSDKContextValue {
  const value = useContext(KadanzaExtensionSDKContext);

  if (value === null) {
    throw new Error(
      "useKadanzaExtensionSDK must be used within KadanzaExtensionSDKProvider",
    );
  }

  return value;
}
```

Do **not** call `destroy()` in the connect effect cleanup — dependency changes would tear down the app-wide singleton. Destroy only on real unload (`pagehide`).

## App composition

```tsx
// App.tsx
import { HashRouter, Routes, Route } from "react-router-dom";
import {
  KadanzaExtensionSDKProvider,
  useKadanzaExtensionSDK,
} from "./KadanzaExtensionSDKContext";
import { Home } from "./Home";

function KadanzaExtensionSDKGate({ children }: { children: React.ReactNode }) {
  const { handshake, error } = useKadanzaExtensionSDK();

  if (error !== null) {
    return <p>Failed to connect: {error.message}</p>;
  }

  if (handshake === null) {
    return <p>Connecting…</p>;
  }

  return children;
}

export function App() {
  return (
    <HashRouter>
      <KadanzaExtensionSDKProvider>
        <KadanzaExtensionSDKGate>
          <Routes>
            <Route path="/" element={<Home />} />
          </Routes>
        </KadanzaExtensionSDKGate>
      </KadanzaExtensionSDKProvider>
    </HashRouter>
  );
}
```

Wrap order: `HashRouter` → `KadanzaExtensionSDKProvider` → ready gate → routes.

## Handshake data

After the gate, `handshake` is available. Read it from the hook:

```tsx
function Home() {
  const { handshake } = useKadanzaExtensionSDK();

  if (handshake === null) {
    return null;
  }

  const { extensionDetails } = handshake;

  return (
    <p>
      Tenant {extensionDetails.tenantDomain} · locale {extensionDetails.locale}
    </p>
  );
}
```

See [`HandshakePayload`](https://kadanza-io.github.io/extension-sdk/interfaces/HandshakePayload.html).

## API calls

```tsx
import { useEffect, useState } from "react";
import { useKadanzaExtensionSDK } from "./KadanzaExtensionSDKContext";

function UserGreeting() {
  const { sdk } = useKadanzaExtensionSDK();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      const user = await sdk.apiCall<{ firstName: string }>(
        "/platform/v1/api/users/me",
      );
      setName(user.firstName);
    }

    loadUser();
  }, [sdk]);

  if (name === null) {
    return <p>Loading…</p>;
  }

  return <p>Hello, {name}</p>;
}
```

The SDK attaches auth and tenant headers. More detail: [API calls](flows.md#api-calls).

## Navigation sync

Notify the parent when the extension route changes, and handle host-driven soft navigation:

```tsx
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useKadanzaExtensionSDK } from "./KadanzaExtensionSDKContext";

export function KadanzaNavigationTracker() {
  const { sdk } = useKadanzaExtensionSDK();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    return sdk.onNavigate(({ path, search }) => {
      navigate(`${path}${search ?? ""}`);
    });
  }, [sdk, navigate]);

  useEffect(() => {
    sdk.emitNavigationChange({
      path: location.pathname,
      search: location.search,
    });
  }, [sdk, location.pathname, location.search]);

  return null;
}
```

Place `<KadanzaNavigationTracker />` next to your routes inside the ready gate. See [Navigation](flows.md#navigation).

## Page settings

When the parent opens extension settings, listen with [`onLoadPageSettings`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#onloadpagesettings) and save with [`emitUpdatePageSettings`](https://kadanza-io.github.io/extension-sdk/interfaces/IExtensionSDK.html#emitupdatepagesettings). Full flow: [Page settings](flows.md#page-settings).

## Rules

- Use the SDK **once per app** — `createExtensionSDK()` is a singleton.
- Calling `connect` again from `useEffect` when deps change is safe.
- Call `destroy()` only on unload (`pagehide`), never in the connect effect cleanup.

See [Flows](flows.md) for handshake, auth-token refresh, API, page settings, and navigation.
