/**
 * Returns whether `urlRaw` is a valid HTTPS extension URL.
 *
 * When `checkOrigin` is provided, the URL's origin must also pass that predicate
 * (e.g. hostname ends with `.kadanza.app`).
 */
export function isValidExtensionUrl(
  urlRaw: string | null | undefined,
  checkOrigin?: (origin: string) => boolean,
): boolean {
  if (typeof urlRaw !== "string") {
    return false;
  }

  try {
    const url = new URL(urlRaw);
    const allowedProtocol = url.protocol === "https:";
    const allowedOrigin = checkOrigin ? checkOrigin(url.origin) : true;
    return allowedProtocol && allowedOrigin;
  } catch {
    return false;
  }
}

/**
 * Clones `urlRaw` and sets the `tenantUrl` search param (parent origin).
 *
 * @param urlRaw - Absolute extension URL string.
 * @param tenantUrl - Parent origin to embed (defaults to `window.location.origin`).
 * @returns Enriched `URL`, or `null` when `urlRaw` is missing or unparsable.
 */
export function enrichExtensionUrl(
  urlRaw: string | null | undefined,
  tenantUrl: string = window.location.origin,
): URL | null {
  if (typeof urlRaw !== "string") {
    return null;
  }

  try {
    const enrichedUrl = new URL(urlRaw);

    if (typeof tenantUrl === "string") {
      enrichedUrl.searchParams.set("tenantUrl", tenantUrl);
    }

    return enrichedUrl;
  } catch {
    return null;
  }
}
