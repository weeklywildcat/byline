import type {
  NewPerson,
  PeopleList,
  PeopleQuery,
  PersonAccessInput,
  PersonCapabilities,
  PersonDetail,
  PersonPatch,
  PersonProfile,
  PersonRow,
} from "@byline/newsroom-screens/people/people-model";
import { validPersonSocialUrl } from "@byline/newsroom-screens/people/people-model";
import {
  APIError,
  commitTransaction,
  initTransaction,
  killTransaction,
  type Where,
} from "payload";
import { atLeast, relationId, sameId } from "../access/user";
import { isSlug } from "../domain/slug";
import { lockPersonRow } from "../db/people";
import { workflowLabel } from "../domain/workflow";
import type { Media, Person, User } from "../payload-types";
import { saveAccount } from "./accounts";
import { readableStories, type ScreenContext } from "./screen-models";

type ProfileDoc = Omit<Person, "createdAt">;
type PortraitDoc = Pick<Media, "id" | "mimeType" | "sizes">;
type AccessDoc = Pick<User, "id" | "email" | "role" | "enabled" | "googleSubject" | "updatedAt" | "linkedPerson">;

const asUser = (ctx: ScreenContext) => ({
  req: ctx.req,
  overrideAccess: false as const,
});
const profileFields = [
  "name",
  "pronouns",
  "shortBio",
  "bio",
  "portrait",
  "publicEmail",
  "socials",
] as const;
const identityFields = [
  "slug",
  "newsroomRole",
  "status",
  "directoryVisible",
  "hasProfilePage",
] as const;
const select = Object.fromEntries(
  [...profileFields, ...identityFields, "updatedAt"].map((key) => [key, true]),
) as Record<
  | (typeof profileFields)[number]
  | (typeof identityFields)[number]
  | "updatedAt",
  true
>;

function editor(ctx: ScreenContext) {
  if (!atLeast(ctx.user, "editor"))
    throw new APIError("Only editors manage People.", 403);
}
export function personCapabilities(
  ctx: ScreenContext,
  id: number,
): PersonCapabilities {
  const editorial = atLeast(ctx.user, "editor");
  return {
    editProfile: editorial || sameId(ctx.user.linkedPerson, id),
    editEditorialIdentity: editorial,
    changeVisibility: editorial,
    manageAccess: atLeast(ctx.user, "administrator"),
    delete: false,
  };
}
function canOpen(ctx: ScreenContext, id: number) {
  if (!personCapabilities(ctx, id).editProfile)
    throw new APIError("You can only edit your own public profile.", 403);
}

export async function portraits(
  ctx: ScreenContext,
  docs: Pick<ProfileDoc, "portrait">[],
): Promise<Map<number, PortraitDoc>> {
  const ids = [
    ...new Set(
      docs
        .map((doc) => Number(relationId(doc.portrait)))
        .filter((id) => id > 0),
    ),
  ];
  if (!ids.length) return new Map();
  const found = await ctx.req.payload.find({
    collection: "media",
    where: { id: { in: ids } },
    select: { sizes: true, mimeType: true },
    depth: 0,
    pagination: false,
    ...asUser(ctx),
  });
  return new Map(found.docs.map((doc) => [doc.id, doc]));
}
function row(doc: ProfileDoc, media: Map<number, PortraitDoc>, access?: Map<number, AccessDoc>): PersonRow {
  const id = Number(relationId(doc.portrait));
  const asset = media.get(id);
  // Private library rendition only. No original URL or account data enters this screen model.
  const url = asset?.mimeType?.startsWith("image/")
    ? asset.sizes?.library?.url ?? null
    : null;
  return {
    id: doc.id,
    name: doc.name,
    slug: doc.slug,
    newsroomRole: doc.newsroomRole ?? "",
    status: doc.status,
    directoryVisible: doc.directoryVisible === true,
    hasProfilePage: doc.hasProfilePage === true,
    portrait: id ? { id, url, unavailable: !url } : null,
    ...(access ? {
      access: (() => {
        const account = access.get(doc.id);
        return account ? { enabled: account.enabled === true, role: account.role } : null;
      })(),
    } : {}),
  };
}
function profile(
  doc: ProfileDoc,
  media: Map<number, PortraitDoc>,
): PersonProfile {
  return {
    ...row(doc, media),
    pronouns: doc.pronouns ?? "",
    shortBio: doc.shortBio ?? "",
    bio: doc.bio ?? "",
    publicEmail: doc.publicEmail ?? "",
    socials: (doc.socials ?? []).map(({ label, url }) => ({ label, url })),
    updatedAt: doc.updatedAt,
  };
}

/** Two batched reads for editors; administrators get one additional batched access-status read. */
export async function peopleList(
  ctx: ScreenContext,
  query: PeopleQuery,
): Promise<PeopleList> {
  editor(ctx);
  const and: Where[] = [];
  if (query.view !== "all") and.push({ status: { equals: query.view } });
  const search = query.search.trim();
  if (search)
    and.push({
      or: ["name", "newsroomRole", "slug"].map((key) => ({
        [key]: { contains: search },
      })),
    });
  const found = await ctx.req.payload.find({
    collection: "people",
    where: and.length ? { and } : {},
    select,
    sort: "name",
    depth: 0,
    limit: 50,
    page: query.page,
    ...asUser(ctx),
  });
  const [media, accessDocs] = await Promise.all([
    portraits(ctx, found.docs),
    atLeast(ctx.user, "administrator") && found.docs.length
      ? ctx.req.payload.find({
          collection: "users",
          where: { linkedPerson: { in: found.docs.map((person) => person.id) } },
          select: { linkedPerson: true, role: true, enabled: true },
          depth: 0,
          pagination: false,
          ...asUser(ctx),
        })
      : Promise.resolve({ docs: [] as AccessDoc[] }),
  ]);
  const access = atLeast(ctx.user, "administrator")
    ? new Map(accessDocs.docs.map((account) => [Number(relationId(account.linkedPerson)), account as AccessDoc]))
    : undefined;
  return {
    people: found.docs.map((doc) => row(doc, media, access)),
    total: found.totalDocs,
    page: found.page ?? 1,
    pages: found.totalPages,
    canCreate: true,
  };
}

export async function personDetail(
  ctx: ScreenContext,
  id: number,
): Promise<PersonDetail> {
  canOpen(ctx, id);
  const doc = await ctx.req.payload.findByID({
    collection: "people",
    id,
    select,
    depth: 0,
    ...asUser(ctx),
  });
  const capabilities = personCapabilities(ctx, id);
  // Draft contributors live on the unversioned plan. Include them without
  // treating a published story's pending rewrite as public copy.
  const bylinePlans = await ctx.req.payload.find({
    collection: "story-plans",
    where: { contributors: { contains: id } },
    select: { story: true },
    depth: 0,
    pagination: false,
    ...asUser(ctx),
  });
  const plannedIds = bylinePlans.docs.map((plan) =>
    Number(relationId(plan.story)),
  );
  const [media, stories, accounts] = await Promise.all([
    portraits(ctx, [doc]),
    ctx.req.payload.find({
      collection: "stories",
      where: {
        or: [{ contributors: { contains: id } }, { id: { in: plannedIds } }],
      },
      select: { headline: true, _status: true },
      depth: 0,
      limit: 6,
      sort: "-updatedAt",
      ...asUser(ctx),
    }),
    // Private sign-in details are part of People only for administrators.
    capabilities.manageAccess
      ? ctx.req.payload.find({
          collection: "users",
          where: { linkedPerson: { equals: id } },
          select: { email: true, role: true, enabled: true, googleSubject: true, updatedAt: true, linkedPerson: true },
          depth: 0,
          limit: 2,
          ...asUser(ctx),
        })
      : Promise.resolve({ docs: [] as AccessDoc[] }),
  ]);
  const plans = stories.docs.length
    ? await ctx.req.payload.find({
        collection: "story-plans",
        where: { story: { in: stories.docs.map((story) => story.id) } },
        select: { story: true, workflow: true },
        depth: 0,
        pagination: false,
        ...asUser(ctx),
      })
    : { docs: [] };
  const readable = await readableStories(
    ctx,
    stories.docs.map((story) => story.id),
    { headline: true },
  );
  const byId = new Map(readable.map((story) => [story.id, story]));
  return {
    person: profile(doc, media),
    capabilities,
    access: capabilities.manageAccess && accounts.docs[0]
      ? {
          id: accounts.docs[0].id,
          email: accounts.docs[0].email,
          role: accounts.docs[0].role,
          enabled: accounts.docs[0].enabled === true,
          googleConnected: Boolean(accounts.docs[0].googleSubject),
          revision: accounts.docs[0].updatedAt,
        }
      : null,
    usage: {
      total: stories.totalDocs,
      stories: stories.docs.flatMap((row) => {
        const story = byId.get(row.id);
        return story
          ? [
              {
                id: story.id,
                title: story.headline || "Untitled story",
                state:
                  story._status === "published"
                    ? "Published"
                    : workflowLabel(
                        plans.docs.find((plan) => sameId(plan.story, story.id))
                          ?.workflow ?? "pitch",
                      ),
                href: `${ctx.admin}/collections/stories/${story.id}`,
              },
            ]
          : [];
      }),
    },
  };
}

export async function ownProfile(
  ctx: ScreenContext,
): Promise<PersonDetail | null> {
  if (ctx.user.linkedPerson === null) return null;
  try {
    return await personDetail(ctx, Number(ctx.user.linkedPerson));
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
}

export async function createPerson(
  ctx: ScreenContext,
  input: NewPerson,
): Promise<PersonDetail> {
  editor(ctx);
  if (!input || !["active", "guest"].includes(input.type))
    throw new APIError("Choose Current staff or Guest contributor.", 400);
  if (
    Object.keys(input).some(
      (key) => !["name", "type", "newsroomRole"].includes(key),
    )
  )
    throw new APIError(
      "Create the Person first. Newsroom access is managed from that Person.",
      400,
    );
  const data = {
    name: input.name,
    newsroomRole: input.newsroomRole ?? "",
    status: input.type,
    directoryVisible: input.type === "active",
    hasProfilePage: input.type === "active",
  };
  validate(data);
  const created = await ctx.req.payload.create({
    collection: "people",
    data: { ...data, slug: "" },
    ...asUser(ctx),
  });
  return personDetail(ctx, created.id);
}

function validate(input: Record<string, unknown>) {
  const lengths = {
    name: 120,
    pronouns: 40,
    newsroomRole: 80,
    shortBio: 400,
    bio: 4000,
  };
  for (const [key, max] of Object.entries(lengths))
    if (
      key in input &&
      (typeof input[key] !== "string" ||
        (input[key] as string).length > max ||
        (key === "name" && !(input[key] as string).trim()))
    )
      throw new APIError(
        key === "name"
          ? "Use a name of 1 to 120 characters."
          : `Use up to ${max} characters for ${key}.`,
        400,
      );
  if ("slug" in input && !isSlug(input.slug))
    throw new APIError(
      "Use lowercase letters, numbers and hyphens for the slug.",
      400,
    );
  if (
    "status" in input &&
    !["active", "guest", "alumni"].includes(String(input.status))
  )
    throw new APIError("Choose a valid status.", 400);
  for (const key of ["directoryVisible", "hasProfilePage"])
    if (key in input && typeof input[key] !== "boolean")
      throw new APIError("Visibility must be on or off.", 400);
  if (
    "publicEmail" in input &&
    (typeof input.publicEmail !== "string" ||
      (input.publicEmail &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.publicEmail)))
  )
    throw new APIError("Use a valid public email, or leave it empty.", 400);
  if (
    "socials" in input &&
    (!Array.isArray(input.socials) ||
      input.socials.length > 8 ||
      input.socials.some((social: unknown) => {
        if (!social || typeof social !== "object") return true;
        const entry = social as Record<string, unknown>;
        return (
          typeof entry.label !== "string" ||
          !entry.label.trim() ||
          entry.label.length > 40 ||
          !validPersonSocialUrl(entry.url) ||
          Object.keys(entry).some((key) => !["label", "url"].includes(key))
        );
      }))
  )
    throw new APIError(
      "Add up to eight labelled HTTPS links. Public email has its own field.",
      400,
    );
}

/**
 * Lock the Person row before comparing its revision. Payload's update uses the
 * SAME request/transaction, so simultaneous saves cannot both win. Raw/system
 * updates acquire the same database row lock through their ordinary UPDATE.
 */
export async function updatePerson(
  ctx: ScreenContext,
  id: number,
  input: PersonPatch,
): Promise<PersonDetail> {
  canOpen(ctx, id);
  if (
    !input ||
    typeof input.expectedUpdatedAt !== "string" ||
    !Number.isFinite(Date.parse(input.expectedUpdatedAt))
  )
    throw new APIError("Reload this profile before saving.", 400);
  const caps = personCapabilities(ctx, id);
  const allowed: string[] = [
    ...profileFields,
    ...(caps.editEditorialIdentity ? identityFields : []),
    "expectedUpdatedAt",
  ];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new APIError(
      "You can't change those identity or account fields.",
      403,
    );
  validate(input);
  if ("portrait" in input && input.portrait !== null) {
    if (!Number.isSafeInteger(input.portrait) || Number(input.portrait) <= 0)
      throw new APIError("Choose an image from Media.", 400);
    const asset = await ctx.req.payload.findByID({
      collection: "media",
      id: input.portrait!,
      depth: 0,
      ...asUser(ctx),
    });
    if (!asset.mimeType?.startsWith("image/"))
      throw new APIError("Choose an image for the portrait.", 400);
  }
  const started = await initTransaction(ctx.req);
  try {
    await lockPersonRow(ctx.req, id);
    const current = await ctx.req.payload.findByID({
      collection: "people",
      id,
      depth: 0,
      ...asUser(ctx),
    });
    if (Date.parse(current.updatedAt) !== Date.parse(input.expectedUpdatedAt))
      throw new APIError(
        "Someone else changed this profile. Reload to see the newer version.",
        409,
      );
    const { expectedUpdatedAt: _expected, ...data } = input;
    await ctx.req.payload.update({
      collection: "people",
      id,
      data,
      ...asUser(ctx),
    });
    if (started) await commitTransaction(ctx.req);
  } catch (error) {
    if (started) await killTransaction(ctx.req);
    throw error;
  }
  return personDetail(ctx, id);
}


/** Administrators grant, edit, enable and disable sign-in without leaving the Person. */
export async function savePersonAccess(
  ctx: ScreenContext,
  id: number,
  input: PersonAccessInput,
): Promise<PersonDetail> {
  if (!atLeast(ctx.user, "administrator"))
    throw new APIError("Only administrators can manage newsroom access.", 403);
  if (
    !input ||
    typeof input.email !== "string" ||
    typeof input.enabled !== "boolean" ||
    !["staff", "editor", "administrator"].includes(String(input.role)) ||
    !("expectedRevision" in input)
  )
    throw new APIError("Enter a valid email, access level and access status.", 400);

  const person = await ctx.req.payload.findByID({
    collection: "people",
    id,
    select: { name: true },
    depth: 0,
    ...asUser(ctx),
  });
  const linked = await ctx.req.payload.find({
    collection: "users",
    where: { linkedPerson: { equals: id } },
    depth: 0,
    limit: 2,
    ...asUser(ctx),
  });
  if (linked.totalDocs > 1)
    throw new APIError("This Person has more than one sign-in account. Resolve it in System administration.", 409);

  let current = linked.docs[0] ?? null;
  if (current && input.expectedRevision !== current.updatedAt)
    throw new APIError("This access changed. Reload the Person before saving.", 409);
  if (!current && input.expectedRevision !== null)
    throw new APIError("This access changed. Reload the Person before saving.", 409);

  // The bootstrap administrator may exist before People are imported. Reuse an
  // exactly matching unlinked account instead of creating a second identity.
  if (!current) {
    const email = input.email.trim().toLowerCase();
    const matches = await ctx.req.payload.find({
      collection: "users",
      where: { email: { equals: email } },
      depth: 0,
      limit: 2,
      ...asUser(ctx),
    });
    const match = matches.docs[0] ?? null;
    if (match) {
      const owner = relationId(match.linkedPerson);
      if (owner !== null && !sameId(owner, id))
        throw new APIError("That login email already belongs to another Person.", 409);
      current = match;
    }
  }

  await saveAccount(
    ctx,
    {
      name: person.name,
      email: input.email,
      role: input.role,
      enabled: input.enabled,
      linkedPerson: id,
      password: input.password ?? "",
      expected: current?.updatedAt,
    },
    current?.id,
  );
  return personDetail(ctx, id);
}
