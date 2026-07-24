import type { ConnectionEvent } from "./events";
import type { ExtensionMessage } from "./types";

export type MessageHandler = (event: MessageEvent<ExtensionMessage>) => void;

export function postToParent(
  type: ConnectionEvent,
  allowedOrigin: string,
  payload?: unknown,
): void {
  if (!window.parent || window.parent === window) {
    throw new Error("Extension is not running inside a parent frame.");
  }

  const message: ExtensionMessage = payload === undefined ? { type } : { type, payload };
  window.parent.postMessage(message, allowedOrigin);
}

export function subscribeToParentMessages(
  allowedOrigin: string,
  handler: MessageHandler,
): () => void {
  const listener = (event: MessageEvent) => {
    if (event.origin !== allowedOrigin) {
      return;
    }

    if (!event.data || typeof event.data !== "object" || !("type" in event.data)) {
      return;
    }

    handler(event as MessageEvent<ExtensionMessage>);
  };

  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
