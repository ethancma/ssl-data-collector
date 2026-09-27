import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const SMOKE_SECTIONS = [
  {
    id: "daily-operations",
    file: ".github/skills/e2e-testing/scripts/daily-logging-forms.smoke.ts",
  },
  {
    id: "auth-admin",
    file: ".github/skills/e2e-testing/scripts/auth-and-admin.smoke.ts",
  },
  {
    id: "sidebar-shell",
    file: ".github/skills/e2e-testing/scripts/sidebar-ui.smoke.ts",
  },
  {
    id: "operational-rbac",
    file: ".github/skills/e2e-testing/scripts/rbac-tiers.smoke.ts",
  },
  {
    id: "star-treatments",
    file: ".github/skills/e2e-testing/scripts/star-treatments.smoke.ts",
  },
  {
    id: "rls-rebuild",
    file: ".github/skills/e2e-testing/scripts/rls-rebuild.smoke.ts",
  },
  {
    id: "systems-trends",
    file: ".github/skills/e2e-testing/scripts/systems-trends.smoke.ts",
  },
] as const;

export type SmokeSectionId = (typeof SMOKE_SECTIONS)[number]["id"];

export interface SmokeSelection {
  files: string[];
  sections: (typeof SMOKE_SECTIONS)[number][];
  reasons: Map<SmokeSectionId, string[]>;
  escalatedToFullSuite: boolean;
}

interface SelectionRule {
  description: string;
  matches: (file: string) => boolean;
  sections: readonly SmokeSectionId[] | "full";
}

const allSectionIds = SMOKE_SECTIONS.map(({ id }) => id);
const scriptRoot = ".github/skills/e2e-testing/scripts/";

const rules: SelectionRule[] = [
  {
    description: "daily operations, forms, or Home dashboard",
    matches: (file) =>
      /^app\/protected\/(daily-operations|home)(\/|$)/.test(file) ||
      file === "app/protected/admin/quick-picks/page.tsx" ||
      file === "app/protected/settings/water-quality-targets/page.tsx" ||
      /^components\/daily-operations\//.test(file) ||
      /^components\/(chemical-addition-form|daily-check-form|feeding-log-form|health-observation-form|maintenance-log-form|quick-pick-catalog-manager|water-quality-form|water-quality-target-manager)\.tsx$/.test(
        file,
      ) ||
      /^lib\/validation\/(chemical-addition|daily-check|feeding-log|health-observation|maintenance-log|water-quality)\.ts$/.test(
        file,
      ),
    sections: ["daily-operations"],
  },
  {
    description: "authentication or Admin user management",
    matches: (file) =>
      /^app\/auth\//.test(file) ||
      file === "app/protected/admin/page.tsx" ||
      /^components\/(admin-users-table|auth-button|login-form|logout-button|sign-up-form)\.tsx$/.test(
        file,
      ),
    sections: ["auth-admin"],
  },
  {
    description: "protected shell, sidebar, navigation, or theme",
    matches: (file) =>
      /^components\/protected-(shell|sidebar)\.tsx$/.test(file) ||
      /^app\/protected\/(layout|page)\.tsx$/.test(file),
    sections: ["sidebar-shell"],
  },
  {
    description: "Star treatment flow",
    matches: (file) =>
      /^app\/protected\/star-treatments(\/|$)/.test(file) ||
      file === "app/protected/admin/quick-picks/page.tsx" ||
      file === "components/quick-pick-catalog-manager.tsx" ||
      /^components\/star-treatment-(form|record)\.tsx$/.test(file),
    sections: ["star-treatments"],
  },
  {
    description: "Systems dashboard or trend charts",
    matches: (file) =>
      /^app\/protected\/systems(\/|$)/.test(file) ||
      /^components\/systems\//.test(file),
    sections: ["systems-trends"],
  },
  ...SMOKE_SECTIONS.map<SelectionRule>(({ id, file }) => ({
    description: `the ${id} smoke section itself`,
    matches: (changedFile) => changedFile === file,
    sections: [id],
  })),
  {
    description: "shared e2e helper or Playwright configuration",
    matches: (file) =>
      file === `${scriptRoot}helpers.ts` || file === "playwright.config.ts",
    sections: "full",
  },
  {
    description: "database, migration, seed, grant, or RLS change (Tier 3+)",
    matches: (file) => /^supabase\//.test(file),
    sections: "full",
  },
  {
    description: "shared application or runtime configuration",
    matches: (file) =>
      /^components\/ui\//.test(file) ||
      /^lib\/(config|models|supabase)\//.test(file) ||
      /^(components\.json|package(-lock)?\.json|next\.config\.ts|postcss\.config\.mjs|proxy\.ts|tailwind\.config\.ts)$/.test(
        file,
      ) ||
      /^app\/(globals\.css|layout\.tsx|page\.tsx)$/.test(file),
    sections: "full",
  },
];

const unknownRuntimeRule: SelectionRule = {
  description: "unknown application/runtime file",
  matches: (file) => /^(app|components|lib)\//.test(file),
  sections: "full",
};

function normalizeFile(file: string, cwd: string): string {
  const normalized = file.trim().replaceAll("\\", "/");
  const relative = path.isAbsolute(normalized)
    ? path.relative(cwd, normalized).replaceAll("\\", "/")
    : normalized;
  return relative.replace(/^\.\//, "");
}

export function selectSmokeSections(
  changedFiles: readonly string[],
  cwd = process.cwd(),
): SmokeSelection {
  const files = [...new Set(changedFiles.map((file) => normalizeFile(file, cwd)).filter(Boolean))]
    .sort();
  const reasons = new Map<SmokeSectionId, string[]>();
  let escalatedToFullSuite = false;

  for (const file of files) {
    const matchingRules = rules.filter((candidate) => candidate.matches(file));
    if (matchingRules.length === 0 && unknownRuntimeRule.matches(file)) {
      matchingRules.push(unknownRuntimeRule);
    }

    for (const rule of matchingRules) {
      const sectionIds = rule.sections === "full" ? allSectionIds : rule.sections;
      if (rule.sections === "full") escalatedToFullSuite = true;
      for (const sectionId of sectionIds) {
        const entries = reasons.get(sectionId) ?? [];
        const reason = `${file}: ${rule.description}`;
        if (!entries.includes(reason)) entries.push(reason);
        reasons.set(sectionId, entries);
      }
    }
  }

  return {
    files,
    sections: SMOKE_SECTIONS.filter(({ id }) => reasons.has(id)),
    reasons,
    escalatedToFullSuite,
  };
}

function gitChangedFiles(): string[] {
  const commands = [
    ["diff", "--name-only", "--relative", "HEAD", "--"],
    ["ls-files", "--others", "--exclude-standard"],
  ];

  return commands.flatMap((args) => {
    const result = spawnSync("git", args, { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
    }
    return result.stdout.split("\n").filter(Boolean);
  });
}

interface CliOptions {
  files: string[];
  full: boolean;
  run: boolean;
}

function parseArgs(args: readonly string[]): CliOptions {
  const options: CliOptions = { files: [], full: false, run: false };
  let sourceCount = 0;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--run") {
      options.run = true;
    } else if (argument === "--full") {
      options.full = true;
      sourceCount += 1;
    } else if (argument === "--git-diff") {
      options.files.push(...gitChangedFiles());
      sourceCount += 1;
    } else if (argument === "--files") {
      sourceCount += 1;
      while (args[index + 1] && !args[index + 1].startsWith("--")) {
        options.files.push(args[index + 1]);
        index += 1;
      }
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (sourceCount !== 1 || (!options.full && options.files.length === 0)) {
    throw new Error("Choose exactly one of --files <paths...>, --git-diff, or --full");
  }
  return options;
}

function printSelection(selection: SmokeSelection, full: boolean, run: boolean): void {
  console.log(`Mode: ${run ? "RUN" : "DRY RUN"}${full ? " (explicit full suite)" : ""}`);
  if (selection.files.length > 0) {
    console.log("Changed files:");
    for (const file of selection.files) console.log(`  - ${file}`);
  }

  if (selection.sections.length === 0) {
    console.log("Selected smoke sections: none (no application/runtime coverage needed)");
    return;
  }

  console.log("Selected smoke sections:");
  for (const section of selection.sections) {
    console.log(`  - ${section.file}`);
    for (const reason of selection.reasons.get(section.id) ?? []) {
      console.log(`      because ${reason}`);
    }
  }
  console.log(
    `Command: npx playwright test ${selection.sections.map(({ file }) => file).join(" ")}`,
  );
}

function main(): void {
  try {
    const options = parseArgs(process.argv.slice(2));
    const selection = options.full
      ? {
          files: [],
          sections: [...SMOKE_SECTIONS],
          reasons: new Map(
            SMOKE_SECTIONS.map(({ id }) => [id, ["explicit --full escape hatch"]]),
          ),
          escalatedToFullSuite: true,
        }
      : selectSmokeSections(options.files);

    printSelection(selection, options.full, options.run);
    if (!options.run || selection.sections.length === 0) return;

    const result = spawnSync(
      "npx",
      ["playwright", "test", ...selection.sections.map(({ file }) => file)],
      { stdio: "inherit" },
    );
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}