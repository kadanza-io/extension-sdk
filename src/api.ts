interface ApiRequestContext {
  baseUrl: string;
  tenantDomain: string;
  authTokenJwt: string;
}

function deriveApiUrl(baseUrl: string): string {
  if (baseUrl.startsWith("/")) {
    return baseUrl;
  }

  const url = new URL(baseUrl);
  url.hostname = `api.${url.hostname}`;
  return url.origin;
}

function resolveApiEndpoint(baseUrl: string, endpoint: string): string {
  if (!endpoint.startsWith("/") || endpoint.startsWith("//")) {
    throw new Error(
      'API endpoint must be a root-relative path starting with a single "/".',
    );
  }

  return `${deriveApiUrl(baseUrl).replace(/\/+$/, "")}${endpoint}`;
}

export async function callApi<T>(
  endpoint: string,
  context: ApiRequestContext,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  headers.set("Authorization", `Bearer ${context.authTokenJwt}`);
  headers.set("X-Tenant", context.tenantDomain);

  const response = await fetch(resolveApiEndpoint(context.baseUrl, endpoint), {
    ...options,
    headers,
  });

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(`API call failed: ${response.status}${statusText}.`);
  }

  return (await response.json()) as T;
}
