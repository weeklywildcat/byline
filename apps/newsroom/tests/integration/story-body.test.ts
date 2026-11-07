import { createLocalReq, getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIXTURE_BLOCKS } from "../../../../packages/article-body/src/fixtures";
import { blockFields } from "../../../../packages/editor/tests/lexical-fixture";
import type { User } from "../../src/payload-types";

/**
 * Story body rules against real PostgreSQL: privileged blocks (Editor's Note,
 * Repository Interactive) cannot be added, changed or removed by staff through
 * any save path (draft, autosave, REST-shaped local API), an unchanged one
 * survives, and publishing is refused for a body whose blocks would be left
 * out, with one message per block.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
let sectionId = 0;

async function account(key: string, role: User["role"]) {
  const person = (await payload.create({ collection: "people", data: { name: `${key} Person`, slug: `body-${key}`, status: "active" } })).id;
  const user = await payload.create({ collection: "users", data: { email: `body-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, linkedPerson: person } });
  accounts[key] = { ...user, collection: "users" } as User;
}
const reqAs = (key: string) => createLocalReq({ user: accounts[key] }, payload);

const text = (value: string) => ({ type: "text", text: value, format: 0, detail: 0, mode: "normal", style: "", version: 1 });
const paragraph = (value: string) => ({ type: "paragraph", version: 1, format: "", indent: 0, direction: "ltr", children: [text(value)] });
const block = (value: Parameters<typeof blockFields>[0]) => ({ type: "block", version: 2, format: "", fields: blockFields(value) });
const body = (...children: unknown[]) => ({ root: { type: "root", version: 1, format: "", indent: 0, direction: "ltr", children } }) as never;
const note = (value: string) => block({ ...FIXTURE_BLOCKS.editorsNote, body: [{ type: "paragraph", children: [{ type: "text", text: value }] }] });

const kinds = (value: unknown) => ((value as { root: { children: Array<{ type: string; fields?: { blockType?: string } }> } }).root.children).map((node) => node.fields?.blockType ?? node.type);
const textOf = (value: unknown, index: number) => (((value as { root: { children: Array<{ children?: Array<{ text?: string }> }> } }).root.children[index]?.children?.[0]?.text) ?? "");
const noteBody = (value: unknown) => (((value as { root: { children: Array<{ fields?: { blockType?: string; body?: string } }> } }).root.children).find((node) => node.fields?.blockType === "editorsNote")?.fields?.body) ?? "";

const story = async (key: string, data: Record<string, unknown> = {}) => (await payload.create({ collection: "stories", draft: true, data: { headline: "Body rules", ...data }, req: await reqAs(key), overrideAccess: false })).id as number;
const save = async (key: string, id: number, bodyValue: unknown, options: { autosave?: boolean } = {}) => (await payload.update({ collection: "stories", id, draft: true, autosave: options.autosave, data: { body: bodyValue as never }, req: await reqAs(key), overrideAccess: false })) as unknown as { body: unknown };
const saved = async (id: number) => ((await payload.findByID({ collection: "stories", id, draft: true, depth: 0, overrideAccess: true })) as unknown as { body: unknown }).body;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_story_body`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("editor", "editor");
  await account("staff", "staff");
  sectionId = (await payload.create({ collection: "sections", data: { name: "News", slug: "news" }, overrideAccess: true })).id as number;
});

afterAll(async () => {
  await payload.destroy();
});

describe("privileged blocks are enforced on the server", () => {
  it("lets an editor insert, change and remove an Editor's Note", async () => {
    const id = await story("editor");
    await save("editor", id, body(paragraph("One."), note("First words.")));
    expect(noteBody(await saved(id))).toBe("First words.");
    await save("editor", id, body(paragraph("One."), note("Changed words.")));
    expect(noteBody(await saved(id))).toBe("Changed words.");
    await save("editor", id, body(paragraph("One.")));
    expect(kinds(await saved(id))).toEqual(["paragraph"]);
  });

  it("drops an Editor's Note or Repository Interactive a staff writer inserts, keeping their own work", async () => {
    const id = await story("staff");
    await save("staff", id, body(paragraph("Mine."), note("Staff-written note."), block(FIXTURE_BLOCKS.repositoryInteractive), paragraph("Also mine.")));
    const after = await saved(id);
    expect(kinds(after)).toEqual(["paragraph", "paragraph"]);
    expect(textOf(after, 0)).toBe("Mine.");
    expect(textOf(after, 1)).toBe("Also mine.");
  });

  it("keeps an unchanged Editor's Note through unrelated staff edits, autosaves included", async () => {
    const id = await story("staff");
    await save("editor", id, body(paragraph("Draft."), note("The editors' words."), paragraph("End.")));
    // The staff writer edits prose around it (a normal save, then an autosave).
    await save("staff", id, body(paragraph("Draft, revised."), note("The editors' words."), paragraph("End.")));
    await save("staff", id, body(paragraph("Draft, revised again."), note("The editors' words."), paragraph("End."), paragraph("A new paragraph.")), { autosave: true });
    const after = await saved(id);
    expect(kinds(after)).toEqual(["paragraph", "editorsNote", "paragraph", "paragraph"]);
    expect(noteBody(after)).toBe("The editors' words.");
    expect(textOf(after, 0)).toBe("Draft, revised again.");
  });

  it("restores a changed or removed Editor's Note without discarding the staff edit", async () => {
    const id = await story("staff");
    await save("editor", id, body(paragraph("Draft."), note("Original editors' words."), paragraph("End.")));
    await save("staff", id, body(paragraph("Edited."), note("Rewritten by staff."), paragraph("End.")));
    let after = await saved(id);
    expect(noteBody(after)).toBe("Original editors' words.");
    expect(textOf(after, 0)).toBe("Edited.");
    await save("staff", id, body(paragraph("Edited again."), paragraph("End.")), { autosave: true });
    after = await saved(id);
    expect(kinds(after)).toEqual(["paragraph", "editorsNote", "paragraph"]);
    expect(noteBody(after)).toBe("Original editors' words.");
    expect(textOf(after, 0)).toBe("Edited again.");
  });

  it("applies to a Repository Interactive the same way", async () => {
    const id = await story("staff");
    await save("editor", id, body(paragraph("Draft."), block(FIXTURE_BLOCKS.repositoryInteractive)));
    await save("staff", id, body(paragraph("Draft."), block({ ...FIXTURE_BLOCKS.repositoryInteractive, key: "someone-elses-key" })));
    const interactive = ((await saved(id)) as { root: { children: Array<{ fields?: { blockType?: string; key?: string } }> } }).root.children.find((node) => node.fields?.blockType === "repositoryInteractive");
    expect(interactive?.fields?.key).toBe(FIXTURE_BLOCKS.repositoryInteractive.key);
  });
});

describe("publishing is strict about the body", () => {
  const publish = async (id: number) => payload.update({ collection: "stories", id, data: { _status: "published" }, req: await reqAs("editor"), overrideAccess: false });
  const refusal = async (id: number) => {
    try {
      await publish(id);
    } catch (error) {
      return ((error as { data?: { errors?: Array<{ path: string; message: string }> } }).data?.errors ?? []).map((item) => `${item.path}: ${item.message}`).join("\n");
    }
    throw new Error("Publish was not refused.");
  };
  const complete = () => ({ headline: "Complete story", slug: `complete-${Math.random().toString(36).slice(2, 8)}`, section: sectionId });
  const draftBody = async (id: number, ...children: unknown[]) => payload.update({ collection: "stories", id, draft: true, data: { body: body(...children) }, req: await reqAs("editor"), overrideAccess: false });
  const doc = (key: string, blockFieldsValue: Parameters<typeof blockFields>[0]) => ({ type: "block", version: 2, format: "", fields: { ...blockFields(blockFieldsValue), ...(key ? { key } : {}) } });

  it("saves drafts with unfinished blocks, then names each unfinished block when publishing", async () => {
    const id = await story("editor", complete());
    await draftBody(id,
      paragraph("Text."),
      doc("", { ...FIXTURE_BLOCKS.video, captionsConfirmed: false }),
      doc("", { ...FIXTURE_BLOCKS.audio, media: null }),
      doc("", { ...FIXTURE_BLOCKS.dataTable, title: "" }),
      doc("", { ...FIXTURE_BLOCKS.repositoryInteractive, key: "not-registered" })
    );
    const message = await refusal(id);
    expect(message).toMatch(/Video: Confirm the video has captions/);
    expect(message).toMatch(/Audio: Choose an audio file/);
    expect(message).toMatch(/Data Table: Give the table a title/);
    expect(message).toMatch(/Repository Interactive: This interactive is not in the site's code/);
  });

  it("publishes a body of blocks that need no records, and lets a harmless empty row through", async () => {
    const id = await story("editor", complete());
    await draftBody(id, paragraph("Text."), doc("", { ...FIXTURE_BLOCKS.video, captionsConfirmed: true }), doc("", FIXTURE_BLOCKS.keyNumbers), doc("", { ...FIXTURE_BLOCKS.dataTable, rows: [...FIXTURE_BLOCKS.dataTable.rows, { id: "blank", cells: ["", "", ""] }] }), doc("", FIXTURE_BLOCKS.expandable), doc("", FIXTURE_BLOCKS.comparison));
    await expect(publish(id)).resolves.toMatchObject({ _status: "published" });
  });

  it("refuses Related Coverage that names an unpublished or deleted story, and a poll that is still a draft", async () => {
    const draftStory = await story("editor", complete());
    const publicStory = await story("editor", complete());
    await publish(publicStory);
    const poll = (await payload.create({ collection: "polls", data: { question: "Do you like lunch?", pollKey: `lunch-${Math.random().toString(36).slice(2, 7)}`, options: [{ optionId: "yes", label: "Yes" }, { optionId: "no", label: "No" }], status: "draft" }, overrideAccess: true })).id as number;
    const id = await story("editor", complete());

    await draftBody(id, paragraph("Text."), doc("", { ...FIXTURE_BLOCKS.relatedCoverage, stories: [{ id: "a", story: draftStory }, { id: "b", story: 99999 }] }), doc("", { ...FIXTURE_BLOCKS.poll, poll }));
    const message = await refusal(id);
    expect(message).toMatch(/Related Coverage: A story that is not published, or is gone, is left out\./);
    expect(message).toMatch(/Related Coverage: Choose at least one published story\./);
    expect(message).toMatch(/Poll: This poll is not public yet, or is gone\./);

    // The same story self-linked is not a valid related story either.
    await draftBody(id, doc("", { ...FIXTURE_BLOCKS.relatedCoverage, stories: [{ id: "self", story: id }] }));
    expect(await refusal(id)).toMatch(/Related Coverage: Choose at least one published story\./);

    // Published stories and an open poll publish.
    await payload.update({ collection: "polls", id: poll, data: { status: "open" }, overrideAccess: true });
    await draftBody(id, paragraph("Text."), doc("", { ...FIXTURE_BLOCKS.relatedCoverage, stories: [{ id: "a", story: publicStory }] }), doc("", { ...FIXTURE_BLOCKS.poll, poll }));
    await expect(publish(id)).resolves.toMatchObject({ _status: "published" });
  });
});
