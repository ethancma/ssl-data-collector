import assert from "node:assert/strict";
import { test } from "node:test";

import { buildInvitationUrl, generateInvitationToken, hashInvitationToken } from "../../lib/invitations";

test("generateInvitationToken returns unique 32-byte base64url tokens", () => {
  const a = generateInvitationToken();
  const b = generateInvitationToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
});

test("hashInvitationToken is a deterministic SHA-256 hex digest", () => {
  assert.equal(
    hashInvitationToken("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("buildInvitationUrl joins origin and token without a double slash", () => {
  assert.equal(buildInvitationUrl("https://app.example/", "tok"), "https://app.example/invite/tok");
  assert.equal(buildInvitationUrl("https://app.example", "tok"), "https://app.example/invite/tok");
});
