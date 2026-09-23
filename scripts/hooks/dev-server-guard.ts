// PreToolUse hook (matcher: Bash). Reads the hook payload on stdin and denies
// commands that would start an astro dev server when this checkout already has
// one, or when the machine-wide server cap is reached. Runs with plain bun and
// no dependencies so it works in worktrees without node_modules.
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const MAX_SERVERS = Number(process.env.DEV_SERVER_MAX ?? 3);

function deny(reason: string): never {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

let command = "";
try {
  command = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.command ?? "";
} catch {
  process.exit(0);
}

const startsServer = [
  /(?:^|[;&|(]\s*)astro\s+dev\b/,
  /(?:bunx?|npx)\s+(?:--bun\s+)?astro\s+dev\b/,
  /\.bin\/astro(?:\.cmd)?["']?\s+dev\b/,
  /astro\.mjs["']?\s+dev\b/,
  /\bbun\s+(?:run\s+)?dev(?::\w+)?\b/,
].some((re) => re.test(command));

const managesServer = /\bdev\s+(?:stop|status|logs)\b/.test(command) || /--help\b/.test(command);

if (!startsServer || managesServer) {
  process.exit(0);
}

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const lockPath = join(root, ".astro", "dev.json");
if (existsSync(lockPath)) {
  try {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    if (typeof lock.pid === "number" && isAlive(lock.pid)) {
      deny(
        `A dev server for this checkout is already running at ${lock.url} (pid ${lock.pid}). ` +
          "Reuse it (`bunx astro dev status`, `bunx astro dev logs`). " +
          "If a restart is genuinely needed, run `bunx astro dev stop` first.",
      );
    }
  } catch {
    // Unreadable lockfile: fall through to the machine-wide check.
  }
}

let running: string[] = [];
try {
  running = execFileSync("ps", ["axo", "pid=,etime=,command="], { encoding: "utf8" })
    .split("\n")
    .filter(
      (line) =>
        /astro(?:\.mjs)?["']?\s+dev\b/.test(line) &&
        !/\bdev\s+(?:stop|status|logs)\b/.test(line) &&
        // bunx launcher processes wrap the real server and would double-count it
        !/\bbunx\b/.test(line) &&
        // shell wrappers merely mention the command; real servers are node/bun processes
        !/\b(?:zsh|bash|sh)\s+-l?c\b/.test(line),
    )
    .map((line) => line.trim().slice(0, 140));
} catch {
  process.exit(0);
}

if (running.length >= MAX_SERVERS) {
  deny(
    `${running.length} astro dev servers are already running on this machine (cap ${MAX_SERVERS}):\n` +
      running.map((line) => `  ${line}`).join("\n") +
      "\nStop an idle one first (`bunx astro dev stop` in its checkout), reuse a running server, " +
      "or ask the user which servers to keep. Most tasks need no dev server: use `bun run check` and unit tests.",
  );
}

process.exit(0);
