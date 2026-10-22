const DEVELOPMENT_SITE_ORIGIN = "http://localhost:3000";
const DEFAULT_REDIRECT_PATH = "/protected/home";

export function normalizeSiteOrigin(value: string, requireHttps: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a valid absolute URL.");
  }

  if (
    !["http:", "https:"].includes(url.protocol)
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new Error("NEXT_PUBLIC_SITE_URL must contain only an HTTP(S) origin.");
  }
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (requireHttps && url.protocol !== "https:" && !isLoopback) {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS in production.");
  }

  return url.origin;
}

export function getSiteOrigin(): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configuredOrigin) {
    if (process.env.NODE_ENV !== "production") {
      return DEVELOPMENT_SITE_ORIGIN;
    }
    throw new Error("NEXT_PUBLIC_SITE_URL must be configured in production.");
  }

  return normalizeSiteOrigin(
    configuredOrigin,
    process.env.NODE_ENV === "production",
  );
}

export function isSameSiteOrigin(origin: string | null): boolean {
  return origin !== null && origin === getSiteOrigin();
}

export function safeRedirectPath(value: unknown): string {
  if (
    typeof value !== "string"
    || !value.startsWith("/")
    || value.startsWith("//")
    || value.includes("\\")
  ) {
    return DEFAULT_REDIRECT_PATH;
  }

  const origin = getSiteOrigin();
  try {
    const url = new URL(value, origin);
    if (
      url.origin !== origin
      || !url.pathname.startsWith("/")
      || url.pathname.startsWith("//")
      || url.pathname.includes("\\")
    ) {
      return DEFAULT_REDIRECT_PATH;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_REDIRECT_PATH;
  }
}
