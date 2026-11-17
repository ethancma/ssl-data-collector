const DEV_SUPABASE_ORIGIN = "https://hcaopgzlvuyuyjcjxuvy.supabase.co";

export const LOCAL_SUPABASE_TARGET_ERROR =
  "Supabase target blocked: local or unverified app origins may use only the Dev project or local Supabase on port 54321. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SITE_URL.";

function isLoopbackHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === "localhost" || host === "[::1]" || host === "::1"
    || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

function isLocalHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (isLoopbackHostname(host) || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "[::]" || host.startsWith("[::ffff:") || /^\[(?:fc|fd|fe[89ab])/i.test(host)) return true;
  if (!host.includes(".") && !host.includes(":")) return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return parts[0] === 0 || parts[0] === 10
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
}

export function hostFromHostHeader(host: string | null) {
  if (!host || /[/?#@\\\s]/.test(host)) return null;
  try {
    const url = new URL(`https://${host}`);
    return url.username || url.password || url.pathname !== "/" || url.search || url.hash
      ? null
      : url.host;
  } catch {
    return null;
  }
}

function isCanonicalHostedRequest(context: { host: string | null; siteOrigin?: string; nodeEnv?: string }) {
  if (context.nodeEnv !== "production" || !context.siteOrigin) return false;
  const host = hostFromHostHeader(context.host);
  if (!host) return false;
  try {
    const origin = new URL(context.siteOrigin);
    return origin.protocol === "https:" && !origin.username && !origin.password
      && origin.pathname === "/" && !origin.search && !origin.hash
      && !isLocalHostname(origin.hostname) && origin.host === host;
  } catch {
    return false;
  }
}

export function localSupabaseTargetError(
  supabaseUrl: string | undefined,
  context: { host: string | null; siteOrigin?: string; nodeEnv?: string },
) {
  if (isCanonicalHostedRequest(context)) return null;
  if (!supabaseUrl) return LOCAL_SUPABASE_TARGET_ERROR;

  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    return LOCAL_SUPABASE_TARGET_ERROR;
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    return LOCAL_SUPABASE_TARGET_ERROR;
  }

  const dev = url.origin === DEV_SUPABASE_ORIGIN;
  const local = url.protocol === "http:" && url.port === "54321" && isLoopbackHostname(url.hostname);
  return dev || local ? null : LOCAL_SUPABASE_TARGET_ERROR;
}

export function assertSafeSupabaseTarget(
  supabaseUrl: string | undefined,
  context: { host: string | null; siteOrigin?: string; nodeEnv?: string },
) {
  const error = localSupabaseTargetError(supabaseUrl, context);
  if (error) throw new Error(error);
}
