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
  assert.deepEqual(selectedIds(["components/daily-operations/water-quality-form.tsx"]), [
    "daily-operations",
  ]);
  assert.deepEqual(selectedIds(["lib/validation/common-fields.ts"]), [
    "daily-operations",
  ]);
  assert.deepEqual(selectedIds(["lib/daily-operations/water-quality-targets.ts"]), [
    "daily-operations",
  ]);
});

test("keeps shared Pacific time and the Star catalog files off the full suite", () => {
  assert.deepEqual(selectedIds(["lib/pacific-date-time.ts"]), [
    "daily-operations",
    "systems-trends",
  ]);
  assert.deepEqual(selectedIds(["lib/daily-operations/quick-pick-catalog-config.ts"]), [
    "daily-operations",
    "star-treatments",
  ]);
  assert.deepEqual(selectedIds(["lib/daily-operations/quick-pick-catalog-manager.ts"]), [
    "daily-operations",
    "star-treatments",
  ]);
  assert.deepEqual(selectedIds(["app/protected/daily-operations/data.ts"]), [
    "daily-operations",
    "batch-logging",
  ]);
});

test("selects daily operations and star treatments for quick-pick management", () => {
  assert.deepEqual(selectedIds(["components/settings/quick-pick-catalog-manager.tsx"]), [
    "daily-operations",
    "star-treatments",
  ]);
  assert.deepEqual(selectedIds(["components/settings/quick-pick-catalog-item.tsx"]), [
    "daily-operations",
    "star-treatments",
  ]);
  assert.deepEqual(selectedIds(["app/protected/settings/quick-picks/page.tsx"]), [
    "daily-operations",
    "operational-rbac",
    "star-treatments",
  ]);
});

test("selects Star treatment and batch coverage for the shared validator", () => {
  assert.deepEqual(selectedIds(["lib/validation/star-treatment.ts"]), [
    "star-treatments",
    "batch-logging",
  ]);
});

test("selects batch logging for batch feeding and Star treatment surfaces", () => {
  assert.deepEqual(selectedIds(["lib/daily-operations/batch-selection.ts"]), [
    "daily-operations",
    "batch-logging",
  ]);
  assert.deepEqual(selectedIds(["components/daily-operations/feeding-log-form.tsx"]), [
    "daily-operations",
    "batch-logging",
  ]);
});

test("selects daily operations for water-quality target management", () => {
  for (const file of [
    "components/settings/water-quality-target-manager.tsx",
    "app/protected/settings/water-quality-targets/page.tsx",
  ]) {
    assert.deepEqual(selectedIds([file]), ["daily-operations"]);
  }
});

test("keeps the Admin users surface focused on auth-admin", () => {
  for (const file of [
    "app/protected/admin/page.tsx",
    "components/admin/admin-users-table.tsx",
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
    "components/auth/invitation-acceptance-form.tsx",
    "components/auth/reset-password-form.tsx",
    "lib/invitations.ts",
  ]) {
    assert.deepEqual(selectedIds([file]), ["auth-admin"]);
  }
});

test("maps the reorganized component folders to their sections", () => {
  assert.deepEqual(selectedIds(["components/layout/protected-sidebar.tsx"]), [
    "sidebar-shell",
  ]);
  assert.deepEqual(selectedIds(["components/auth/login-form.tsx"]), ["auth-admin"]);
  assert.deepEqual(selectedIds(["components/star-treatments/star-treatment-record.tsx"]), [
    "star-treatments",
  ]);
  assert.deepEqual(selectedIds(["components/forms/unit-select.tsx"]), [
    "daily-operations",
    "star-treatments",
  ]);
});

test("combines known surfaces in stable section order", () => {
  assert.deepEqual(
    selectedIds([
      "components/systems/charts.tsx",
      "components/star-treatments/star-treatment-form.tsx",
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
    "components/settings/quick-pick-catalog-manager.tsx",
    "supabase/config.toml",
    "./components/settings/quick-pick-catalog-manager.tsx",
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