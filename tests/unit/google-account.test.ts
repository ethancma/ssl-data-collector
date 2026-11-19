import assert from "node:assert/strict";
import test from "node:test";

import { emailDomain, hasGoogleMx, isGoogleAccountEmail } from "@/lib/google-account";

function dnsFetch(body: unknown, calls: string[] = [], ok = true): typeof fetch {
  return (async (url: string | URL | Request) => {
    calls.push(String(url));
    return { ok, json: async () => body } as Response;
  }) as typeof fetch;
}

test("emailDomain lowercases the domain and rejects malformed addresses", () => {
  assert.equal(emailDomain("Star@UW.Edu"), "uw.edu");
  assert.equal(emailDomain("no-at-sign"), null);
  assert.equal(emailDomain("a@localhost"), null);
  assert.equal(emailDomain("a@evil.com/../x"), null);
});

test("hasGoogleMx requires every MX host to be Google's", () => {
  assert.equal(hasGoogleMx([{ type: 15, data: "1 aspmx.l.google.com." }, { type: 15, data: "5 alt1.aspmx.l.google.com." }]), true);
  assert.equal(hasGoogleMx([{ type: 15, data: "1 smtp.google.com." }]), true);
  assert.equal(hasGoogleMx([{ type: 15, data: "1 aspmx.l.google.com." }, { type: 15, data: "10 mx.other.org." }]), false);
  assert.equal(hasGoogleMx([{ type: 15, data: "10 mail.notgoogle.com." }]), false);
  assert.equal(hasGoogleMx([{ type: 5, data: "aspmx.l.google.com." }]), false);
  assert.equal(hasGoogleMx([]), false);
});

test("Gmail addresses are Google accounts without a DNS lookup", async () => {
  const calls: string[] = [];
  assert.equal(await isGoogleAccountEmail("someone@gmail.com", dnsFetch({}, calls)), true);
  assert.equal(await isGoogleAccountEmail("someone@googlemail.com", dnsFetch({}, calls)), true);
  assert.deepEqual(calls, []);
});

test("Workspace domains are detected by MX and only the domain is sent", async () => {
  const calls: string[] = [];
  const google = { Status: 0, Answer: [{ type: 15, data: "1 smtp.google.com." }] };
  assert.equal(await isGoogleAccountEmail("tech@lab.example.org", dnsFetch(google, calls)), true);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /name=lab\.example\.org&type=MX$/);
  assert.doesNotMatch(calls[0], /tech/);
});

test("lookup failures and non-Google answers fall back to not Google", async () => {
  const calls: string[] = [];
  assert.equal(await isGoogleAccountEmail("a@x.test", dnsFetch({ Status: 3 }, calls)), false);
  assert.equal(calls.length, 1);
  assert.equal(await isGoogleAccountEmail("a@x.test", dnsFetch({}, [], false)), false);
  assert.equal(await isGoogleAccountEmail("a@x.test", (async () => { throw new Error("offline"); }) as typeof fetch), false);
  assert.equal(await isGoogleAccountEmail("a@x.test", dnsFetch({ Status: 0, Answer: [{ type: 15, data: "10 mx.x.test." }] })), false);
});

test("a blocked resolver hostname falls back to the resolver IP", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    if (String(url).startsWith("https://cloudflare-dns.com/")) throw new Error("ENOTFOUND");
    return { ok: true, json: async () => ({ Status: 0, Answer: [{ type: 15, data: "1 smtp.google.com." }] }) } as Response;
  }) as typeof fetch;
  assert.equal(await isGoogleAccountEmail("a@lab.example.org", fetchImpl), true);
  assert.deepEqual(calls.map((url) => new URL(url).host), ["cloudflare-dns.com", "1.1.1.1"]);
});
