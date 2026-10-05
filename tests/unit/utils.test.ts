import assert from "node:assert/strict";
import test from "node:test";

import { nullIfBlank } from "@/lib/utils";

test("nullIfBlank trims text and maps blank or missing values to null", () => {
  assert.equal(nullIfBlank("  hello  "), "hello");
  assert.equal(nullIfBlank("   "), null);
  assert.equal(nullIfBlank(""), null);
  assert.equal(nullIfBlank(undefined), null);
  assert.equal(nullIfBlank(null), null);
});
