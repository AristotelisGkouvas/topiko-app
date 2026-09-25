// Regenerates src/lib/api-schema.ts from the backend's OpenAPI document.
//
// A script rather than a one-line shell command because the one-liner broke on
// Windows twice over: `python` there is the system interpreter, without the
// backend's packages, and `> openapi.json` truncated the file before the
// command failed — leaving an empty document for the next step to read.
//
// Uses the backend's virtualenv when there is one (local development) and
// falls back to `python` (CI, where the packages are installed globally).

import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = join(dirname(fileURLToPath(import.meta.url)), "..");
const backend = join(frontend, "..", "backend");

const venv = [
  join(backend, ".venv", "Scripts", "python.exe"),
  join(backend, ".venv", "bin", "python"),
].find(existsSync);

const document = execFileSync(venv ?? "python", ["-m", "scripts.openapi"], {
  cwd: backend,
  encoding: "utf-8",
  env: { ...process.env, PYTHONIOENCODING: "utf-8" },
});
// Written only once the backend answered, so a failure leaves the old file.
writeFileSync(join(frontend, "openapi.json"), document);

// The generator's own entry point, run by this Node — no shell, no npx.
execFileSync(
  process.execPath,
  [
    join(frontend, "node_modules", "openapi-typescript", "bin", "cli.js"),
    "openapi.json",
    "-o",
    "src/lib/api-schema.ts",
  ],
  { cwd: frontend, stdio: "inherit" },
);
