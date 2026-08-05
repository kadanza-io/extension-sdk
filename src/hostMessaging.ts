import type { ConnectionEvent } from "./events";
import type { ExtensionMessage } from "./types";

export type HostMessageHandler = (
  event: MessageEvent<ExtensionMessage>,
) => void;

/**
 * Posts a typed extension message to an embedded child frame.
 *
 * @param contentWindow - The iframe's `contentWindow`.
 * @param origin - Target origin for `postMessage` (extension origin).
 * @param type - Wire event type from {@link CONNECTION_EVENTS}.
 * @param payload - Optional message payload.
 */
export function postToChild(
  contentWindow: Window,
  origin: string,
  type: ConnectionEvent,
  payload?: unknown,
): void {
  const message: ExtensionMessage =
    payload === undefined ? { type } : { type, payload };
  contentWindow.postMessage(message, origin);
}

/**
 * Subscribes to `message` events from a child frame at `origin`.
 *
 * Ignores events from other origins and payloads without a `type` field.
 *
 * @returns Unsubscribe function.
 */
export function subscribeToChildMessages(
  origin: string,
  handler: HostMessageHandler,
): () => void {
  const listener = (event: MessageEvent) => {
    if (event.origin !== origin) {
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
