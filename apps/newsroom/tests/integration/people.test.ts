import {
  createLocalReq,
  getPayload,
  type Payload,
  type PayloadRequest,
} from "payload";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newsroomEndpoints } from "../../src/newsroom/endpoints";
import { publicPeople } from "../../src/newsroom/public-people";
import type { User } from "../../src/payload-types";

let payload: Payload;
const accounts: Record<string, User> = {};
const persons: Record<string, number> = {};
let portrait: number;
let historical: number;
let secret: number;

const reqAs = (key: string | null) =>
  createLocalReq(key ? { user: accounts[key] } : {}, payload);
async function call(
  method: string,
  path: string,
  key: string | null,
  data?: unknown,
  id?: number,
  query = "",
) {
  const req = await reqAs(key);
  Object.assign(req, {
    data,
    routeParams: id ? { id: String(id) } : {},
    searchParams: new URLSearchParams(query),
  });
  const endpoint = newsroomEndpoints.find(
    (entry) => entry.method === method && entry.path === path,
  )!;
  const res = (await endpoint.handler(req)) as Response;
  return { status: res.status, body: (await res.json()) as any };
}
const detail = (key: string, id = persons[key]) =>
  call("get", "/byline/people/:id", key, undefined, id);
const patch = async (
  key: string,
  id: number,
  changes: Record<string, unknown>,
  revision?: string,
) =>
  call(
    "patch",
    "/byline/people/:id",
    key,
    {
      expectedUpdatedAt:
        revision ??
        (await payload.findByID({ collection: "people", id })).updatedAt,
      ...changes,
    },
    id,
  );

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname += "_people";
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  for (const [key, role] of [
    ["admin", "administrator"],
    ["editor", "editor"],
    ["writer", "staff"],
    ["other", "staff"],
    ["unlinked", "staff"],
    ["disabled", "staff"],
  ] as const) {
    if (key !== "unlinked")
      persons[key] = (
        await payload.create({
          collection: "people",
          data: {
            name: `${key} Person`,
            slug: `people-${key}`,
            newsroomRole: "Staff writer",
            status: "active",
          },
        })
      ).id;
    const user = await payload.create({
      collection: "users",
      data: {
        name: `${key} Account`,
        email: `private-${key}@example.test`,
        password: `people-${key}-123456`,
        role,
        enabled: key !== "disabled",
        linkedPerson: persons[key] ?? null,
        googleSubject: `private-google-${key}`,
        discordUserId: `private-discord-${key}`,
      },
    });
    accounts[key] = { ...user, collection: "users" } as User;
  }
  const data = await sharp({
    create: { width: 800, height: 800, channels: 3, background: "#7b2235" },
  })
    .jpeg()
    .toBuffer();
  portrait = (
    await payload.create({
      collection: "media",
      data: { alt: "Writer portrait", credit: "Byline" },
      file: {
        data,
        name: "writer.jpg",
        mimetype: "image/jpeg",
        size: data.length,
      },
    })
  ).id;
  await payload.update({
    collection: "people",
    id: persons.writer,
    data: {
      portrait,
      publicEmail: "public-writer@example.test",
      pronouns: "they/them",
      shortBio: "Covers student life.",
      bio: "A full public biography.",
      socials: [{ label: "Website", url: "https://example.test/writer" }],
    },
  });
  historical = (
    await payload.create({
      collection: "stories",
      data: {
        headline: "Historical reporting",
        contributors: [persons.writer],
        _status: "published",
      } as never,
      req: await reqAs("editor"),
      overrideAccess: false,
    })
  ).id;
  secret = (
    await payload.create({
      collection: "stories",
      data: {
        headline: "Private unrelated investigation",
        contributors: [persons.writer],
      },
      draft: true,
      req: await reqAs("other"),
      overrideAccess: false,
    })
  ).id;
  // The Person once appeared on a version, but is no longer on the current byline.
  const archivePerson = await payload.create({
    collection: "people",
    data: {
      name: "Historical guest",
      slug: "people-historical-guest",
      status: "guest",
    },
  });
  persons.versionOnly = archivePerson.id;
  const draft = await payload.create({
    collection: "stories",
    data: { headline: "Versioned byline", contributors: [archivePerson.id] },
    draft: true,
    req: await reqAs("editor"),
    overrideAccess: false,
  });
  await payload.update({
    collection: "stories",
    id: draft.id,
    draft: true,
    data: { contributors: [] },
    req: await reqAs("editor"),
    overrideAccess: false,
  });
}, 300_000);
afterAll(async () => {
  await payload?.destroy();
});

describe("People routes and access", () => {
  it("editors list People alphabetically, with no accounts or per-row usage", async () => {
    const result = await call("get", "/byline/people", "editor");
    expect(result.status).toBe(200);
    expect(result.body.canCreate).toBe(true);
    expect(result.body.people.map((p: { name: string }) => p.name)).toEqual(
      [...result.body.people.map((p: { name: string }) => p.name)].sort(),
    );
    expect(
      result.body.people.every(
        (p: any) => p.status === "active" && !p.account && !p.usage,
      ),
    ).toBe(true);
  });
  it.each(["writer", "unlinked", "disabled", null])(
    "refuses the management list to %s",
    async (key) => {
      expect((await call("get", "/byline/people", key)).status).toBe(
        key === null || key === "disabled" ? 401 : 403,
      );
    },
  );
  it("self-profile resolves only the account's linked Person, even with forged parameters", async () => {
    const result = await call(
      "get",
      "/byline/profile",
      "writer",
      undefined,
      persons.other,
      `person=${persons.other}`,
    );
    expect(result.status).toBe(200);
    expect(result.body.person.id).toBe(persons.writer);
    expect(result.body.capabilities).toEqual({
      editProfile: true,
      editEditorialIdentity: false,
      changeVisibility: false,
      manageAccount: false,
      delete: false,
    });
    expect(result.body.account.names).toEqual([]);
  });
  it("unlinked self-profile returns an empty model without creating a Person", async () => {
    const before = await payload.count({ collection: "people" });
    expect(await call("get", "/byline/profile", "unlinked")).toEqual({
      status: 200,
      body: null,
    });
    expect((await payload.count({ collection: "people" })).totalDocs).toBe(
      before.totalDocs,
    );
  });
  it("staff cannot open or edit another Person", async () => {
    expect((await detail("writer", persons.other)).status).toBe(403);
    expect(
      (await patch("writer", persons.other, { name: "Forged" })).status,
    ).toBe(403);
  });
  it("staff edit their own public fields and portrait relationship", async () => {
    const result = await patch("writer", persons.writer, {
      name: "Alex Writer",
      pronouns: "she/they",
      shortBio: "A new short biography.",
      bio: "A full biography.\nSecond paragraph.",
      portrait,
      publicEmail: "readers@example.test",
      socials: [{ label: "Custom service", url: "https://example.test/alex" }],
    });
    expect(result.status).toBe(200);
    expect(result.body.person).toMatchObject({
      name: "Alex Writer",
      pronouns: "she/they",
      portrait: { id: portrait, unavailable: false },
      publicEmail: "readers@example.test",
    });
    expect(result.body.person.portrait.url).toBe(
      (await payload.findByID({ collection: "media", id: portrait })).sizes
        ?.library?.url,
    );
    expect(
      (await patch("writer", persons.writer, { portrait: null })).body.person
        .portrait,
    ).toBeNull();
  });
  it.each([
    ["newsroomRole", "Editor-in-chief"],
    ["status", "alumni"],
    ["directoryVisible", false],
    ["hasProfilePage", false],
    ["slug", "stolen-slug"],
    ["accounts", []],
    ["linkedPerson", 1],
    ["role", "administrator"],
    ["enabled", false],
  ])("rejects a forged self-service %s write", async (field, value) => {
    const before = await payload.findByID({
      collection: "people",
      id: persons.writer,
      depth: 0,
    });
    expect(
      (await patch("writer", persons.writer, { [String(field)]: value }))
        .status,
    ).toBe(403);
    expect(
      (
        await payload.findByID({
          collection: "people",
          id: persons.writer,
          depth: 0,
        })
      ).updatedAt,
    ).toBe(before.updatedAt);
  });
  it("raw Payload writes independently enforce self-service field access", async () => {
    const before = await payload.findByID({
      collection: "people",
      id: persons.writer,
      depth: 0,
    });
    await payload.update({
      collection: "people",
      id: persons.writer,
      data: {
        newsroomRole: "Administrator",
        status: "alumni",
        slug: "forged",
        directoryVisible: false,
        hasProfilePage: false,
        shortBio: "Allowed public copy",
      },
      overrideAccess: false,
      req: await reqAs("writer"),
    });
    const after = await payload.findByID({
      collection: "people",
      id: persons.writer,
      depth: 0,
    });
    for (const field of [
      "newsroomRole",
      "status",
      "slug",
      "directoryVisible",
      "hasProfilePage",
    ] as const)
      expect(after[field]).toEqual(before[field]);
    expect(after.shortBio).toBe("Allowed public copy");
  });
  it("raw People administration is administrator-only, while API profile access stays available", async () => {
    const admin = payload.collections.people.config.access.admin!;
    expect(await admin({ req: await reqAs("writer") })).toBe(false);
    expect(await admin({ req: await reqAs("editor") })).toBe(false);
    expect(await admin({ req: await reqAs("admin") })).toBe(true);
  });
});

describe("Creation and public identity management", () => {
  it.each([
    ["active", true],
    ["guest", false],
  ] as const)(
    "creates %s with intended defaults and no account",
    async (type, visible) => {
      const before = (await payload.count({ collection: "users" })).totalDocs;
      const result = await call("post", "/byline/people", "editor", {
        name: `New ${type} Person`,
        type,
        newsroomRole: "Photographer",
      });
      expect(result.status).toBe(200);
      expect(result.body.person).toMatchObject({
        name: `New ${type} Person`,
        status: type,
        directoryVisible: visible,
        hasProfilePage: visible,
        newsroomRole: "Photographer",
      });
      expect(result.body.account).toMatchObject({
        linked: false,
        names: [],
        systemHref: null,
      });
      expect((await payload.count({ collection: "users" })).totalDocs).toBe(
        before,
      );
      persons[type] = result.body.person.id;
    },
  );
  it("refuses staff creation and invalid creation types/names/account fields", async () => {
    expect(
      (
        await call("post", "/byline/people", "writer", {
          name: "Guest",
          type: "guest",
        })
      ).status,
    ).toBe(403);
    for (const data of [
      { name: "", type: "guest", newsroomRole: "" },
      { name: "A", type: "alumni" },
      { name: "A", type: "guest", role: "administrator" },
    ])
      expect(
        (await call("post", "/byline/people", "editor", data)).status,
      ).toBe(400);
  });
  it("editors retire identities without silently changing visibility or historical bylines", async () => {
    expect(
      (
        await patch("editor", persons.writer, {
          status: "alumni",
          newsroomRole: "Former staff writer",
        })
      ).status,
    ).toBe(200);
    const person = (await detail("editor", persons.writer)).body.person;
    expect(person).toMatchObject({
      status: "alumni",
      directoryVisible: true,
      hasProfilePage: true,
    });
    expect(
      (
        await payload.findByID({
          collection: "stories",
          id: historical,
          depth: 0,
        })
      ).contributors,
    ).toEqual([persons.writer]);
    expect(
      (
        await call(
          "get",
          "/byline/people",
          "editor",
          undefined,
          undefined,
          "view=alumni",
        )
      ).body.people.map((p: any) => p.id),
    ).toContain(persons.writer);
    expect(
      (
        await call(
          "get",
          "/byline/people",
          "editor",
          undefined,
          undefined,
          "view=guest",
        )
      ).body.people.map((p: any) => p.id),
    ).toContain(persons.guest);
    expect(
      (
        await call(
          "get",
          "/byline/people",
          "editor",
          undefined,
          undefined,
          "view=all&search=former",
        )
      ).body.people.map((p: any) => p.id),
    ).toEqual([persons.writer]);
    expect(
      (
        await call(
          "get",
          "/byline/people",
          "editor",
          undefined,
          undefined,
          "view=all&search=private-editor@example.test",
        )
      ).body.total,
    ).toBe(0);
  });
  it("editors cannot mutate accounts or linkage through the People API", async () => {
    for (const changes of [
      { role: "administrator" },
      { enabled: false },
      { accounts: [] },
      { linkedPerson: persons.other },
    ])
      expect((await patch("editor", persons.writer, changes)).status).toBe(403);
    expect((await detail("editor", persons.writer)).body.account).toMatchObject(
      { linked: true, names: ["writer Account"], systemHref: null },
    );
    expect(
      (await detail("admin", persons.writer)).body.account.systemHref,
    ).toBe("/admin/system");
  });
  it.each([
    "javascript:alert(1)",
    "http://example.test",
    "https://user:pass@example.test",
    "https://",
    "https://example.test/a b",
  ])("rejects unsafe social URL %s", async (url) => {
    expect(
      (
        await patch("editor", persons.writer, {
          socials: [{ label: "Website", url }],
        })
      ).status,
    ).toBe(400);
    await expect(
      payload.update({
        collection: "people",
        id: persons.writer,
        data: { socials: [{ label: "Website", url }] },
      }),
    ).rejects.toThrow();
  });
  it("rejects missing revision, stale edits and two simultaneous writes from one revision", async () => {
    expect(
      (
        await call(
          "patch",
          "/byline/people/:id",
          "editor",
          { name: "No revision" },
          persons.writer,
        )
      ).status,
    ).toBe(400);
    const revision = (await detail("editor", persons.writer)).body.person
      .updatedAt;
    const results = await Promise.all([
      patch(
        "editor",
        persons.writer,
        { shortBio: "First simultaneous save" },
        revision,
      ),
      patch(
        "writer",
        persons.writer,
        { shortBio: "Second simultaneous save" },
        revision,
      ),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const current = (await detail("editor", persons.writer)).body.person;
    const stale = await patch(
      "editor",
      persons.writer,
      { shortBio: "Overwrite" },
      revision,
    );
    expect(stale).toMatchObject({
      status: 409,
      body: {
        message:
          "Someone else changed this profile. Reload to see the newer version.",
      },
    });
    expect((await detail("editor", persons.writer)).body.person.shortBio).toBe(
      current.shortBio,
    );
  });
});

describe("Privacy, accessible usage and historical integrity", () => {
  it("usage reads only accessible stories, with no account secrets in detail", async () => {
    // Put the person on a story, then change the plan's contributors so that the writer no longer has draft access.
    const plan = (
      await payload.find({
        collection: "story-plans",
        where: { story: { equals: secret } },
      })
    ).docs[0];
    await payload.update({
      collection: "story-plans",
      id: plan.id,
      data: { contributors: [] },
      context: { bylineSystem: true },
    });
    const self = (await detail("writer")).body;
    expect(
      self.usage.stories.some((story: any) => story.id === historical),
    ).toBe(true);
    expect(self.usage.stories.some((story: any) => story.id === secret)).toBe(
      false,
    );
    expect(
      (await detail("editor", persons.writer)).body.usage.total,
    ).toBeGreaterThan(self.usage.total);
    expect(
      JSON.stringify((await detail("editor", persons.writer)).body),
    ).not.toMatch(
      /private-.*@|googleSubject|discordUserId|breakGlass|preferences|password|"enabled"|"role"/,
    );
  });
  it("public projection uses only explicit public fields and publicEmail, never User state", async () => {
    await patch("writer", persons.writer, {
      publicEmail: "only-public@example.test",
    });
    const projected = await publicPeople(payload);
    const person = projected.authors.find(
      (person) => person.id === persons.writer,
    )!;
    expect(person.publicEmail).toBe("only-public@example.test");
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toMatch(
      /private-.*@|googleSubject|discordUserId|breakGlass|accounts|linkedPerson|preferences|password|enabled/,
    );
    expect(
      projected.authors.find((person) => person.id === persons.editor)
        ?.publicEmail,
    ).toBe("");
    const guest = projected.guests.find(
      (person) => person.id === persons.guest,
    )!;
    expect(guest).toMatchObject({
      status: "guest",
      directoryVisible: false,
      hasProfilePage: false,
      href: null,
    });
    expect(
      projected.authors.some((person) => person.id === persons.guest),
    ).toBe(false);
    await patch("editor", persons.guest, { hasProfilePage: true });
    expect(
      (await publicPeople(payload)).guests.find(
        (person) => person.id === persons.guest,
      )?.href,
    ).toMatch(/^\/author\//);
  });
  it("editors cannot delete; administrators cannot delete referenced identities, including historical versions", async () => {
    await expect(
      payload.delete({
        collection: "people",
        id: persons.writer,
        req: await reqAs("editor"),
        overrideAccess: false,
      }),
    ).rejects.toThrow();
    for (const id of [persons.writer, persons.versionOnly])
      await expect(
        payload.delete({
          collection: "people",
          id,
          req: await reqAs("admin"),
          overrideAccess: false,
        }),
      ).rejects.toThrow("Alumni");
    const unused = await payload.create({
      collection: "people",
      data: {
        name: "Unused identity",
        slug: "people-unused",
        status: "active",
      },
    });
    await payload.delete({
      collection: "people",
      id: unused.id,
      req: await reqAs("admin"),
      overrideAccess: false,
    });
  });
  it("disabling, demoting, relinking and deleting a User preserve the Person and ordered historical bylines", async () => {
    const before = await payload.findByID({
      collection: "people",
      id: persons.writer,
      depth: 0,
    });
    await payload.update({
      collection: "users",
      id: accounts.writer.id,
      data: { role: "editor" },
    });
    await payload.update({
      collection: "users",
      id: accounts.writer.id,
      data: { enabled: false, linkedPerson: persons.other, role: "staff" },
    });
    await payload.delete({ collection: "users", id: accounts.writer.id });
    const { accounts: _beforeAccounts, ...beforeIdentity } = before;
    const { accounts: _afterAccounts, ...afterIdentity } =
      await payload.findByID({
        collection: "people",
        id: persons.writer,
        depth: 0,
      });
    expect(afterIdentity).toEqual(beforeIdentity);
    expect(
      (
        await payload.findByID({
          collection: "stories",
          id: historical,
          depth: 0,
        })
      ).contributors,
    ).toEqual([persons.writer]);
    expect(
      (await publicPeople(payload)).authors.some(
        (person) => person.id === persons.writer,
      ),
    ).toBe(true);
  });
});
