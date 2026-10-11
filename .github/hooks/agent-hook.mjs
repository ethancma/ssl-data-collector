// Guardrail hooks shared by VS Code (Local) and Copilot CLI/cloud agent. Usage: node agent-hook.mjs <start|pre|post|stop>
// Payloads differ per harness (tool_name/tool_input vs toolName/toolArgs), so both are read and both output shapes are written.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const event = process.argv[2];
let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  // Unparseable payload: fall through with defaults rather than blocking the agent.
}
const cwd = input.cwd || process.cwd();

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, { cwd: root(), encoding: "utf8", ...options });
}

let rootCache;
function root() {
  if (!rootCache) {
    const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
    rootCache = r.status === 0 ? r.stdout.trim() : cwd;
  }
  return rootCache;
}

function git(...args) {
  const r = run("git", args);
  return r.status === 0 ? r.stdout.trim() : null;
}

function emit(eventName, fields) {
  process.stdout.write(JSON.stringify({ ...fields, hookSpecificOutput: { hookEventName: eventName, ...fields } }));
}

const toolName = String(input.tool_name ?? input.toolName ?? "");
let toolArgs = input.tool_input ?? input.toolArgs ?? {};
if (typeof toolArgs === "string") {
  try {
    toolArgs = JSON.parse(toolArgs);
  } catch {
    toolArgs = { command: toolArgs };
  }
}

const isShell = /terminal|bash|shell|powershell/i.test(toolName);
const isEdit = !isShell && /edit|create|replace|write|patch|insert/i.test(toolName);

function editedFiles() {
  const found = [];
  const walk = (value) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      for (const [key, v] of Object.entries(value)) {
        if (/^(filePath|file_path|path)$/.test(key) && typeof v === "string") found.push(v);
        else walk(v);
      }
    } else if (typeof value === "string") {
      for (const m of value.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)) found.push(m[1].trim());
    }
  };
  walk(toolArgs);
  return [...new Set(found.map((f) => path.relative(root(), path.resolve(root(), f))))];
}

const COMMAND_RULES = [
  [/\bgit\s+push\b[^;&|]*(--force\b|--force-with-lease|\s-f\b)/, "deny", "Force-push is never allowed."],
  [/\bgit\s+push\b/, "ask", "Pushing needs the user's explicit approval (AGENTS.md)."],
  [/\bgit\s+reset\s+--hard\b|\bgit\s+clean\s+-\w*f/, "deny", "Destructive git reset/clean: ask the user to run it."],
  [/--no-verify\b/, "deny", "Don't bypass git hooks."],
  [/\bgh\s+pr\s+merge\b/, "deny", "A human merges every PR."],
  [/\b(kill|pkill|killall)\b[^;&|]*\b(3000|next|node)\b|:3000[^;&]*\|\s*xargs\s+kill/, "deny", "Never stop the port-3000 dev server or kill node by name. Run your own server on another port and stop it via its terminal."],
  [/\bsupabase\s+db\s+push\b|\bsupabase\s+db\s+reset\b[^;&|]*(--linked|--db-url)|\bsupabase\s+migration\s+repair\b/, "deny", "Hosted schema changes are human/CI-only. Test migrations locally with `supabase db reset`."],
  [/\bsupabase\b[^;&|]*--linked[^;&|]*\b(drop|truncate|delete|update|alter)\b/i, "ask", "Write against the hosted Supabase project."],
  [/\brm\s+-\w*(rf|fr)\b/, "ask", "Recursive delete."],
];

function fileRule(file) {
  if (/(^|\/)\.env(\.|$)/.test(file) && !file.endsWith(".env.example")) {
    return ["deny", `${file} holds secrets; ask the user to change it.`];
  }
  if (file.startsWith(".github/hooks/")) return ["ask", "Editing agent guardrail hooks."];
  if (/^supabase\/migrations\/.+\.sql$/.test(file) && git("cat-file", "-e", `origin/main:${file}`) !== null) {
    return ["deny", `${file} is already on origin/main; add a new migration instead of editing it.`];
  }
  return null;
}

function preToolUse() {
  const hits = [];
  if (isShell) {
    const command = String(toolArgs.command ?? "");
    for (const [pattern, decision, reason] of COMMAND_RULES) {
      if (pattern.test(command)) {
        hits.push([decision, reason]);
        break;
      }
    }
  }
  if (isEdit) for (const file of editedFiles()) hits.push(fileRule(file));
  const denied = hits.find((h) => h?.[0] === "deny");
  if (denied) {
    process.stderr.write(`Blocked by repo guardrail: ${denied[1]}`);
    process.exit(2);
  }
  const asked = hits.find((h) => h?.[0] === "ask");
  if (asked) emit("PreToolUse", { permissionDecision: "ask", permissionDecisionReason: asked[1] });
}

function postToolUse() {
  if (!isEdit) return;
  const files = editedFiles().filter((f) => /\.(tsx?|mjs|cjs|jsx?)$/.test(f) && existsSync(path.join(root(), f)));
  const eslint = path.join(root(), "node_modules/.bin/eslint");
  if (!files.length || !existsSync(eslint)) return;
  const r = run(eslint, ["--quiet", "--no-warn-ignored", ...files]);
  if (r.status !== 0) {
    const output = `${r.stdout}${r.stderr}`.trim().slice(0, 3000);
    emit("PostToolUse", { additionalContext: `ESLint errors in edited files:\n${output}` });
  }
}

function stop() {
  if (input.stop_hook_active || input.stopHookActive) return;
  const status = git("status", "--porcelain", "--untracked-files=all") ?? "";
  const changed = status.split("\n").map((l) => l.slice(3).trim()).filter((f) => /\.(tsx?|mjs|cjs|jsx?|sql)$/.test(f));
  if (!changed.length) return;

  // Re-verify only when the working tree differs from the last checked state.
  const hash = createHash("sha256").update(git("diff", "HEAD") ?? "");
  for (const f of changed) {
    const full = path.join(root(), f);
    if (existsSync(full)) hash.update(f).update(readFileSync(full));
  }
  const digest = hash.digest("hex");
  const stampFile = path.resolve(root(), git("rev-parse", "--git-path", "agent-verify-stamp") ?? ".git/agent-verify-stamp");
  if (existsSync(stampFile) && readFileSync(stampFile, "utf8") === digest) return;
  writeFileSync(stampFile, digest);

  const r = run("npm", ["run", "-s", "verify"], { timeout: 170_000 });
  if (r.status === 0) return;
  const tail = `${r.stdout}${r.stderr}`.trim().split("\n").slice(-40).join("\n");
  emit("Stop", {
    decision: "block",
    reason: `\`npm run verify\` failed. Fix the root cause (don't suppress it), rerun it, then finish. If the failure is outside your change, report it instead.\n${tail}`,
  });
}

function sessionStart() {
  const facts = [`Branch: ${git("branch", "--show-current") || "detached"}.`];
  const gitDir = git("rev-parse", "--absolute-git-dir");
  const commonDir = git("rev-parse", "--path-format=absolute", "--git-common-dir");
  if (gitDir && commonDir && gitDir !== commonDir) {
    if (!existsSync(path.join(root(), "node_modules"))) {
      facts.push("This worktree is not set up: run `npm run wt -- setup` first.");
    }
    const env = existsSync(path.join(root(), ".env.local")) ? readFileSync(path.join(root(), ".env.local"), "utf8") : "";
    const port = env.match(/^PORT=(\d+)/m)?.[1];
    if (port) facts.push(`Worktree dev server: \`npm run dev -- -p ${port}\` (port 3000 belongs to the main checkout).`);
  }
  emit("SessionStart", { additionalContext: facts.join(" ") });
}

try {
  ({ start: sessionStart, pre: preToolUse, post: postToolUse, stop })[event]?.();
} catch (error) {
  // preToolUse hooks fail closed on crashes; a guardrail bug must not block every tool call.
  process.stderr.write(`agent-hook ${event} error: ${error}\n`);
  process.exit(0);
}
