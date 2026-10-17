#!/usr/bin/env node
/**
 * Decide whether the merged work on main needs a new WordPress plugin release,
 * and when it does, prepare the version bump and release notes.
 *
 *   node scripts/prepare-release.mjs            # write the bump
 *   node scripts/prepare-release.mjs --dry-run  # report only, change nothing
 *
 * Outcomes, reported as `release`, `tag`, `version` and `bumped` (and appended
 * to $GITHUB_OUTPUT when set):
 *
 *   - The plugin header version has no matching `vX.Y.Z` tag yet: someone bumped
 *     it by hand, or an earlier automatic release failed after its bump landed.
 *     Release that version as it is.
 *   - Plugin code changed since the latest tag: bump the patch version, add a
 *     readme.txt changelog entry built from the merged pull request titles, and
 *     release the new version.
 *   - Nothing that ships in the plugin changed: no release.
 *
 * Minor and major bumps stay deliberate. Bump the version and write the readme
 * entry in a pull request and this script releases it unchanged.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

/** Paths whose changes ship inside weekly-wildcat-headless.zip. */
export const PLUGIN_PATHS = ["wordpress-plugin", "packages", "schemas"];

const HEADER = "wordpress-plugin/weekly-wildcat-headless.php";
const PROTOCOL = "wordpress-plugin/includes/core/protocol.php";
const PLUGIN_PACKAGE = "wordpress-plugin/package.json";
const LOCKFILE = "package-lock.json";
const README = "wordpress-plugin/readme.txt";

const UPGRADE_NOTICE = "Maintenance and feature update. Nothing needs reconfiguring after updating.";

export function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Cannot bump version "${version}".`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

/** "feat(plugin): add a thing" -> "Add a thing". */
export function cleanTitle(title) {
  const stripped = title.trim().replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, "");
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/**
 * Turn first-parent commits into changelog lines. GitHub merge commits carry
 * the pull request title in the body; squash merges carry it in the subject.
 * Dependency bumps and earlier release commits are left out.
 */
export function changelogEntries(commits) {
  const entries = [];
  for (const { subject, body } of commits) {
    const merge = /^Merge pull request #(\d+) from \S+/.exec(subject);
    const raw = merge ? body.split("\n").find((line) => line.trim() !== "") ?? "" : subject;
    const number = merge?.[1] ?? /\(#(\d+)\)\s*$/.exec(raw)?.[1];
    const title = cleanTitle(raw.replace(/\s*\(#\d+\)\s*$/, ""));
    if (title === "" || /^(build\(deps|bump\b|chore\(release\))/i.test(raw.trim()) || /^bump\b/i.test(title)) continue;
    entries.push(`* ${title}${number ? ` (#${number})` : ""}`);
  }
  return entries;
}

export function applyVersion(files, version, entries) {
  const header = files.header.replace(/^(\s*\* Version:\s*)\S+/m, `$1${version}`);
  const protocol = files.protocol.replace(/(const BYLINE_PLUGIN_VERSION = ')[^']+(';)/, `$1${version}$2`);
  const pluginPackage = files.pluginPackage.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
  const lockfile = files.lockfile.replace(
    /("wordpress-plugin": \{\s*"name": "@byline\/wordpress-plugin",\s*"version": ")[^"]+(")/,
    `$1${version}$2`
  );

  const changelog = `= ${version} =\n\n${entries.join("\n")}\n\n`;
  const notice = `= ${version} =\n${UPGRADE_NOTICE}\n\n`;
  const readme = files.readme
    .replace(/^(Stable tag:\s*)\S+/m, `$1${version}`)
    .replace("== Changelog ==\n\n", `== Changelog ==\n\n${changelog}`)
    .replace("== Upgrade Notice ==\n\n", `== Upgrade Notice ==\n\n${notice}`);

  return { header, protocol, pluginPackage, lockfile, readme };
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function latestTag() {
  return git("describe", "--tags", "--match", "v[0-9]*", "--abbrev=0");
}

function tagExists(tag) {
  try {
    git("rev-parse", "--verify", "--quiet", `refs/tags/${tag}`);
    return true;
  } catch {
    return false;
  }
}

function commitsSince(tag) {
  const log = git("log", "--first-parent", "--format=%s%x1f%b%x1e", `${tag}..HEAD`, "--", ...PLUGIN_PATHS);
  return log
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [subject, body = ""] = record.split("\x1f");
      return { subject: subject.trim(), body: body.trim() };
    });
}

function report(outcome) {
  for (const [key, value] of Object.entries(outcome)) console.log(`${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outcome).map(([key, value]) => `${key}=${value}\n`).join(""));
  }
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const current = /^\s*\* Version:\s*(\S+)/m.exec(readFileSync(HEADER, "utf8"))?.[1];
  if (!current) throw new Error(`Could not read the plugin version from ${HEADER}.`);

  if (!tagExists(`v${current}`)) {
    report({ release: true, tag: `v${current}`, version: current, bumped: false });
    return;
  }

  const entries = changelogEntries(commitsSince(latestTag()));
  if (entries.length === 0) {
    report({ release: false, tag: "", version: current, bumped: false });
    return;
  }

  const version = bumpPatch(current);
  if (!dryRun) {
    const next = applyVersion(
      {
        header: readFileSync(HEADER, "utf8"),
        protocol: readFileSync(PROTOCOL, "utf8"),
        pluginPackage: readFileSync(PLUGIN_PACKAGE, "utf8"),
        lockfile: readFileSync(LOCKFILE, "utf8"),
        readme: readFileSync(README, "utf8")
      },
      version,
      entries
    );
    writeFileSync(HEADER, next.header);
    writeFileSync(PROTOCOL, next.protocol);
    writeFileSync(PLUGIN_PACKAGE, next.pluginPackage);
    writeFileSync(LOCKFILE, next.lockfile);
    writeFileSync(README, next.readme);
  }
  console.log(entries.join("\n"));
  report({ release: true, tag: `v${version}`, version, bumped: true });
}

if (import.meta.url === `file://${process.argv[1]}`) main();
