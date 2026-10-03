import assert from "node:assert/strict";
import test from "node:test";
import {
  selectSmokeSections,
  SMOKE_SECTIONS,
} from "@/.github/skills/e2e-testing/scripts/select-smoke-sections";

function selectedIds(files: string[]) {
  return selectSmokeSections(files).sections.map(({ id }) => id);
}

test("selects the narrow daily-operations section for a form change", () => {
  assert.deepEqual(selectedIds(["components/water-quality-form.tsx"]), [
    "daily-operations",
  ]);
});

test("selects daily operations and star treatments for quick-pick management", () => {
  assert.deepEqual(selectedIds(["components/quick-pick-catalog-manager.tsx"]), [
    "daily-operations",
    "star-treatments",
  ]);
  assert.deepEqual(selectedIds(["app/protected/settings/quick-picks/page.tsx"]), [
    "daily-operations",
    "operational-rbac",
    "star-treatments",
  ]);
});

test("selects batch logging for batch feeding and Star treatment surfaces", () => {
  assert.deepEqual(selectedIds(["components/daily-operations/batch-selection.ts"]), [
    "daily-operations",
    "batch-logging",
  ]);
  assert.deepEqual(selectedIds(["components/feeding-log-form.tsx"]), [
    "daily-operations",
    "batch-logging",
  ]);
});

test("selects daily operations for water-quality target management", () => {
  for (const file of [
    "components/water-quality-target-manager.tsx",
    "app/protected/settings/water-quality-targets/page.tsx",
  ]) {
    assert.deepEqual(selectedIds([file]), ["daily-operations"]);
  }
});

test("keeps the Admin users surface focused on auth-admin", () => {
  for (const file of [
    "app/protected/admin/page.tsx",
    "components/admin-users-table.tsx",
  ]) {
    assert.deepEqual(selectedIds([file]), ["auth-admin"]);
  }
});

test("keeps invitation, reset, and account settings files focused on auth-admin", () => {
  for (const file of [
    "app/invite/[token]/page.tsx",
    "app/auth/reset/page.tsx",
    "app/protected/settings/page.tsx",
    "app/protected/settings/password-form.tsx",
    "components/invitation-acceptance-form.tsx",
    "components/reset-password-form.tsx",
    "lib/invitations.ts",
  ]) {
    assert.deepEqual(selectedIds([file]), ["auth-admin"]);
  }
});

test("combines known surfaces in stable section order", () => {
  assert.deepEqual(
    selectedIds([
      "components/systems/charts.tsx",
      "components/star-treatment-form.tsx",
      "app/auth/login/page.tsx",
    ]),
    ["auth-admin", "star-treatments", "batch-logging", "systems-trends"],
  );
});

test("maps each smoke section file back to only that section", () => {
  for (const section of SMOKE_SECTIONS) {
    assert.deepEqual(selectedIds([section.file]), [section.id]);
  }
});

test("escalates shared runtime files to the full suite", () => {
  const selection = selectSmokeSections(["components/ui/button.tsx"]);
  assert.equal(selection.escalatedToFullSuite, true);
  assert.deepEqual(
    selection.sections.map(({ id }) => id),
    SMOKE_SECTIONS.map(({ id }) => id),
  );
});

test("escalates migrations so role and RLS coverage cannot be omitted", () => {
  const selection = selectSmokeSections([
    "supabase/migrations/20260926000000_example.sql",
  ]);
  assert.equal(selection.escalatedToFullSuite, true);
  assert.ok(selection.sections.some(({ id }) => id === "operational-rbac"));
  assert.equal(selection.sections.length, SMOKE_SECTIONS.length);
});

test("preserves multi-match reasons when another change escalates to full", () => {
  const selection = selectSmokeSections([
    "components/quick-pick-catalog-manager.tsx",
    "supabase/config.toml",
    "./components/quick-pick-catalog-manager.tsx",
  ]);

  assert.equal(selection.escalatedToFullSuite, true);
  assert.deepEqual(
    selection.sections.map(({ id }) => id),
    SMOKE_SECTIONS.map(({ id }) => id),
  );
  for (const entries of selection.reasons.values()) {
    assert.equal(entries.length, new Set(entries).size);
  }
  assert.equal(
    selection.reasons
      .get("daily-operations")
      ?.some((reason) => reason.includes("quick-pick-catalog-manager.tsx")),
    true,
  );
  assert.equal(
    selection.reasons
      .get("star-treatments")
      ?.some((reason) => reason.includes("quick-pick-catalog-manager.tsx")),
    true,
  );
});

test("escalates unknown application files instead of silently omitting them", () => {
  assert.deepEqual(
    selectedIds(["app/protected/new-surface/page.tsx"]),
    SMOKE_SECTIONS.map(({ id }) => id),
  );
});

test("does not require browser coverage for docs-only changes", () => {
  const selection = selectSmokeSections([
    "docs/testing-strategy.md",
    "README.md",
  ]);
  assert.deepEqual(selection.sections, []);
  assert.equal(selection.escalatedToFullSuite, false);
});