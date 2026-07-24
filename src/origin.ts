const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Thrown when `tenantUrl` is missing or not a safe postMessage origin. */
export class InvalidOriginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOriginError";
  }
}

/**
 * Parses and validates a tenant URL into a postMessage-safe origin.
 * Allows https always; http only for localhost / 127.0.0.1 / [::1].
 *
 * @param tenantUrl - Absolute URL from the `tenantUrl` search param.
 * @returns Origin string suitable for `postMessage` targetOrigin.
 * @throws {InvalidOriginError} When missing, unparsable, or disallowed scheme/host.
 */
export function resolveAllowedOrigin(tenantUrl: string | null): string {
  if (!tenantUrl) {
    throw new InvalidOriginError(
      'Missing "tenantUrl" search parameter required to establish parent origin.',
    );
  }

  let url: URL;
  try {
    url = new URL(tenantUrl);
  } catch {
    throw new InvalidOriginError(`Invalid tenantUrl: "${tenantUrl}".`);
  }

  const isLocalhost = LOCALHOST_HOSTS.has(url.hostname);
  const isHttps = url.protocol === "https:";
  const isLocalHttp = url.protocol === "http:" && isLocalhost;

  if (!isHttps && !isLocalHttp) {
    throw new InvalidOriginError(
      `tenantUrl must use https (or http on localhost). Received: "${url.protocol}//${url.host}".`,
    );
  }

  return url.origin;
}

/**
 * Reads the parent-supplied `tenantUrl` from a URL search string.
 *
 * The parent must pass `tenantUrl` on the iframe `src` so
 * {@link resolveAllowedOrigin} can whitelist the parent origin.
 *
 * @param search - Query string (defaults to `window.location.search`).
 */
export function readTenantUrlFromLocation(
  search: string = window.location.search,
): string | null {
  return new URLSearchParams(search).get("tenantUrl");
}
