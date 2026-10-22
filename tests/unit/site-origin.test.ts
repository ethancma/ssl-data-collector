import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isSameSiteOrigin,
  normalizeSiteOrigin,
  safeRedirectPath,
} from "../../lib/site-origin";

test("normalizeSiteOrigin accepts only a bare HTTP(S) origin", () => {
  assert.equal(normalizeSiteOrigin("https://app.example/", true), "https://app.example");
  assert.equal(normalizeSiteOrigin("http://localhost:3000", false), "http://localhost:3000");
  assert.equal(normalizeSiteOrigin("http://localhost:3000", true), "http://localhost:3000");
  assert.throws(() => normalizeSiteOrigin("https://app.example/path", true));
  assert.throws(() => normalizeSiteOrigin("https://user@app.example", true));
  assert.throws(() => normalizeSiteOrigin("http://app.example", true));
});

test("isSameSiteOrigin requires the exact configured origin", () => {
  const previousOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://app.example";

  try {
    assert.equal(isSameSiteOrigin("https://app.example"), true);
    assert.equal(isSameSiteOrigin("https://attacker.example"), false);
    assert.equal(isSameSiteOrigin(null), false);
  } finally {
    if (previousOrigin === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previousOrigin;
    }
  }
});

test("safeRedirectPath permits internal paths and falls back for external redirects", () => {
  assert.equal(safeRedirectPath("/protected/home?tab=recent"), "/protected/home?tab=recent");
  assert.equal(safeRedirectPath("//attacker.example"), "/protected/home");
  assert.equal(safeRedirectPath("https://attacker.example"), "/protected/home");
  assert.equal(safeRedirectPath("/\\attacker.example"), "/protected/home");
  assert.equal(safeRedirectPath("/%2e%2e//attacker.example"), "/protected/home");
  assert.equal(safeRedirectPath(null), "/protected/home");
});
