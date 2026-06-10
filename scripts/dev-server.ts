import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { spawn } from "node:child_process";

const OP_ENVIRONMENT = "l57xmsivlnctkio4zz673luf64";
const EXTRA_BIN_DIRS = ["/opt/homebrew/bin", "/usr/local/bin"];

function withLocalBinPaths(pathValue: string | undefined) {
  return [...EXTRA_BIN_DIRS, pathValue].filter(Boolean).join(delimiter);
}

function findExecutable(name: string, pathValue: string) {
  for (const dir of pathValue.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const pathValue = withLocalBinPaths(process.env.PATH);
const astroArgs = process.argv.slice(2).filter((arg, index) => index !== 0 || arg !== "--");
const opPath = findExecutable("op", pathValue);

const command = opPath ?? "bunx";
const args = opPath
  ? ["run", "--environment", OP_ENVIRONMENT, "--", "bunx", "--bun", "astro", "dev", ...astroArgs]
  : ["--bun", "astro", "dev", ...astroArgs];

const child = spawn(command, args, {
  env: { ...process.env, PATH: pathValue },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
