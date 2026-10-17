import assert from "node:assert/strict";
import { test } from "node:test";

import { applyVersion, bumpPatch, changelogEntries, cleanTitle } from "./prepare-release.mjs";

test("bumpPatch increments only the patch number", () => {
  assert.equal(bumpPatch("0.3.1"), "0.3.2");
  assert.equal(bumpPatch("1.9.9"), "1.9.10");
  assert.throws(() => bumpPatch("0.3"));
});

test("cleanTitle drops conventional-commit prefixes", () => {
  assert.equal(cleanTitle("feat(plugin): add a thing"), "Add a thing");
  assert.equal(cleanTitle("fix!: break the thing"), "Break the thing");
  assert.equal(cleanTitle("Send visitors to the login page"), "Send visitors to the login page");
});

test("changelogEntries reads GitHub merge commits and squash merges", () => {
  const entries = changelogEntries([
    { subject: "Merge pull request #115 from weeklywildcat/gibby/login-redirect", body: "Send logged-out CMS visitors straight to the login page" },
    { subject: "feat(plugin): add guest photos (#116)", body: "" },
    { subject: "Merge pull request #72 from weeklywildcat/dependabot/npm_and_yarn/adm-zip-0.6.1", body: "build(deps): bump adm-zip from 0.6.0 to 0.6.1" },
    { subject: "chore(release): Byline 0.3.1", body: "" }
  ]);

  assert.deepEqual(entries, [
    "* Send logged-out CMS visitors straight to the login page (#115)",
    "* Add guest photos (#116)"
  ]);
});

test("applyVersion updates every place the version lives", () => {
  const files = {
    header: "<?php\n/**\n * Plugin Name: Byline\n * Version: 0.3.1\n */\n",
    protocol: "<?php\nconst BYLINE_PLUGIN_VERSION = '0.3.1';\n",
    pluginPackage: '{\n  "name": "@byline/wordpress-plugin",\n  "version": "0.3.1"\n}\n',
    lockfile: '{\n    "wordpress-plugin": {\n      "name": "@byline/wordpress-plugin",\n      "version": "0.3.1",\n      "dependencies": {}\n    },\n    "other": {\n      "version": "0.3.1"\n    }\n}\n',
    readme: "Stable tag: 0.3.1\n\n== Changelog ==\n\n= 0.3.1 =\n\n* Old.\n\n== Upgrade Notice ==\n\n= 0.3.1 =\nOld notice.\n"
  };

  const next = applyVersion(files, "0.3.2", ["* New thing (#1)"]);

  assert.match(next.header, /\* Version: 0\.3\.2/);
  assert.match(next.protocol, /BYLINE_PLUGIN_VERSION = '0\.3\.2'/);
  assert.match(next.pluginPackage, /"version": "0\.3\.2"/);
  assert.match(next.lockfile, /"@byline\/wordpress-plugin",\s*"version": "0\.3\.2"/);
  assert.match(next.lockfile, /"other": \{\s*"version": "0\.3\.1"/, "other packages keep their version");
  assert.match(next.readme, /Stable tag: 0\.3\.2/);
  assert.match(next.readme, /== Changelog ==\n\n= 0\.3\.2 =\n\n\* New thing \(#1\)\n\n= 0\.3\.1 =/);
  assert.match(next.readme, /== Upgrade Notice ==\n\n= 0\.3\.2 =\n.+\n\n= 0\.3\.1 =/);
});
