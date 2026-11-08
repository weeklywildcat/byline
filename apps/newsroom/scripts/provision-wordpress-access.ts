import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getPayload } from "payload";
import config from "../src/payload.config";

type ExportUser = {
  id: number;
  name: string;
  accountEmail?: string;
  accountRoles?: string[];
};

type WordPressExport = {
  schemaVersion: number;
  users: ExportUser[];
};

const argv = process.argv.slice(2);
const argument = (name: string) => {
  const inline = argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? null : null;
};

const file = argument("--file");
const apply = argv.includes("--apply");
if (!file) {
  console.error("Usage: provision-wordpress-access.ts --file <export.json> [--apply]");
  process.exit(64);
}

const raw = JSON.parse(await readFile(file, "utf8")) as WordPressExport;
if (raw.schemaVersion !== 1 || !Array.isArray(raw.users)) throw new Error("Malformed WordPress export.");

function bylineRole(roles: string[] | undefined): "staff" | "editor" | "administrator" {
  const normalized = new Set((roles ?? []).map((role) => role.toLowerCase()));
  if (normalized.has("administrator")) return "administrator";
  if (normalized.has("editor")) return "editor";
  return "staff";
}

const payload = await getPayload({ config });
const summary = { create: 0, enable: 0, reuse: 0, users: [] as Array<Record<string, unknown>> };

try {
  for (const source of raw.users) {
    const email = (source.accountEmail ?? "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`WordPress user ${source.id} (${source.name}) has no valid account email.`);
    }

    const people = await payload.find({
      collection: "people",
      where: { legacyWordPressId: { equals: source.id } },
      depth: 0,
      limit: 2,
      overrideAccess: true,
    });
    if (people.totalDocs !== 1) {
      throw new Error(`WordPress user ${source.id} (${source.name}) maps to ${people.totalDocs} Byline People; expected exactly one.`);
    }
    const person = people.docs[0];

    const linked = await payload.find({
      collection: "users",
      where: { linkedPerson: { equals: person.id } },
      depth: 0,
      limit: 2,
      overrideAccess: true,
    });
    if (linked.totalDocs > 1) throw new Error(`Person ${person.id} has multiple Byline accounts.`);

    const emailMatch = await payload.find({
      collection: "users",
      where: { email: { equals: email } },
      depth: 0,
      limit: 2,
      overrideAccess: true,
    });
    if (emailMatch.totalDocs > 1) throw new Error(`Email ${email} belongs to multiple Byline accounts.`);

    const role = bylineRole(source.accountRoles);
    let existing = linked.docs[0] as any | undefined;
    const byEmail = emailMatch.docs[0] as any | undefined;

    if (byEmail && existing && Number(byEmail.id) !== Number(existing.id)) {
      throw new Error(`WordPress user ${source.id} has separate Byline matches by Person and email.`);
    }
    existing ??= byEmail;

    if (existing) {
      if (existing.linkedPerson && Number(existing.linkedPerson) !== Number(person.id)) {
        throw new Error(`Email ${email} is already linked to another Person.`);
      }
      const needsEnable = existing.enabled !== true || !existing.linkedPerson;
      if (needsEnable) summary.enable++;
      else summary.reuse++;
      summary.users.push({ wordpressId: source.id, name: source.name, email, role: existing.role, action: needsEnable ? "enable/link" : "reuse" });

      if (apply && needsEnable) {
        await payload.update({
          collection: "users",
          id: existing.id,
          data: { enabled: true, linkedPerson: person.id },
          overrideAccess: true,
        });
      }
      continue;
    }

    summary.create++;
    summary.users.push({ wordpressId: source.id, name: source.name, email, role, action: "create" });
    if (apply) {
      await payload.create({
        collection: "users",
        data: {
          name: source.name,
          email,
          role,
          enabled: true,
          linkedPerson: person.id,
          password: randomBytes(32).toString("base64url"),
        },
        overrideAccess: true,
      });
    }
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", summary }, null, 2));
  if (apply) console.log("\nWordPress newsroom access provisioned.");
  else console.log("\nDry run only. Re-run with --apply to create/enable accounts.");
} finally {
  await payload.destroy();
}
