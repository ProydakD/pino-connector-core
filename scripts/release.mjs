#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , bump] = process.argv;
const allowed = new Set(["major", "minor", "patch"]);

if (!allowed.has(bump)) {
  console.error("Usage: pnpm run release <major|minor|patch>");
  process.exit(1);
}

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: "inherit" });
}

const pkgPath = resolve("package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const previousVersion = pkg.version;

try {
  run("pnpm run lint");
  run("pnpm run typecheck");
  run("pnpm run test");
  run("pnpm run coverage");
  run(`pnpm version ${bump} --no-git-tag-version`);

  const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
  const nextVersion = updated.version;

  const changelogPath = resolve("CHANGELOG.md");
  const date = new Date().toISOString().slice(0, 10);
  const header = "# Changelog\n\n";
  const entry = `## ${nextVersion} - ${date}\n\n- describe changes here\n\n`;
  let existing = "";
  if (existsSync(changelogPath)) {
    existing = readFileSync(changelogPath, "utf8");
    existing = existing.replace(/^# Changelog\s*/i, "");
  }
  const changelog = header + entry + existing;
  writeFileSync(changelogPath, changelog, { encoding: "utf8" });

  run("pnpm run build");
  run("pnpm run release:dry");

  console.log(
    `\nRelease preparation complete. Version bumped from ${previousVersion} to ${nextVersion}.`,
  );
  console.log("Review CHANGELOG.md and commit the results before publishing.");
} catch (error) {
  console.error("Release script failed.", error);
  process.exitCode = 1;
}
