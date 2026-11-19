const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);
const GOOGLE_MX = /(^|\.)(google|googlemail)\.com\.?$/i;
const LOOKUP_TIMEOUT_MS = 1500;
// Same Cloudflare resolver: Workers can't fetch the bare IP, and some networks block the hostname.
const DOH_ENDPOINTS = ["https://cloudflare-dns.com/dns-query", "https://1.1.1.1/dns-query"];

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  const domain = at > 0 ? email.slice(at + 1).trim().toLowerCase() : "";
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) ? domain : null;
}

// DNS JSON MX answers are "<priority> <host>", e.g. "1 aspmx.l.google.com." or "1 smtp.google.com.".
export function hasGoogleMx(answers: { type?: number; data?: string }[]): boolean {
  const hosts = answers
    .filter((answer) => answer.type === 15 && typeof answer.data === "string")
    .map((answer) => answer.data!.trim().split(/\s+/).pop() ?? "");
  return hosts.length > 0 && hosts.every((host) => GOOGLE_MX.test(host));
}

// Gmail addresses and domains whose mail is hosted by Google Workspace can sign in with
// Google. Only the domain leaves the server; any lookup failure means "not known to be Google".
export async function isGoogleAccountEmail(email: string, fetchImpl: typeof fetch = fetch) {
  const domain = emailDomain(email);
  if (!domain) return false;
  if (GMAIL_DOMAINS.has(domain)) return true;
  const signal = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);
  for (const endpoint of DOH_ENDPOINTS) {
    try {
      const response = await fetchImpl(`${endpoint}?name=${encodeURIComponent(domain)}&type=MX`, {
        headers: { accept: "application/dns-json" },
        signal,
      });
      if (!response.ok) continue;
      const body = (await response.json()) as { Status?: number; Answer?: { type?: number; data?: string }[] };
      return body.Status === 0 && hasGoogleMx(body.Answer ?? []);
    } catch {
      if (signal.aborted) return false;
    }
  }
  return false;
}
