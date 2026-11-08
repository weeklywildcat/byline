import { describe, expect, it } from "vitest";
import { lexicalToPlainText, LIVE_TEXT_MAX, plainTextToLexical } from "../src/newsroom/live-text";

const children = (text: string) => (plainTextToLexical(text).root.children as Array<Record<string, unknown>>);

describe("live update text", () => {
  it("makes a paragraph per blank-line-separated block, with line breaks inside one", () => {
    const blocks = children("Doors open at six.\nThe band starts at seven.\n\nSecond paragraph.");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("paragraph");
    expect((blocks[0].children as Array<{ type: string }>).map((node) => node.type)).toEqual(["text", "linebreak", "text"]);
  });

  it("makes a bulleted list from a block of dash lines", () => {
    const [list] = children("- First\n- Second\n- Third");
    expect(list.type).toBe("list");
    expect(list.listType).toBe("bullet");
    expect((list.children as unknown[]).length).toBe(3);
  });

  it("links bare http(s) URLs without swallowing sentence punctuation, and nothing else", () => {
    const [paragraph] = children("Read https://example.com/budget. Not javascript:alert(1) or ftp://x.test or http://user:pw@evil.test/.");
    const nodes = paragraph.children as Array<{ type: string; fields?: { url: string }; text?: string }>;
    const links = nodes.filter((node) => node.type === "link");
    expect(links.map((node) => node.fields?.url)).toEqual(["https://example.com/budget"]);
    expect(nodes.find((node) => node.type === "text" && node.text?.startsWith("."))).toBeTruthy();
  });

  it("never produces anything but prose nodes, whatever it is given", () => {
    const allowed = new Set(["root", "paragraph", "text", "linebreak", "link", "list", "listitem"]);
    const walk = (node: { type: string; children?: unknown[] }): string[] => [node.type, ...((node.children ?? []) as Array<{ type: string; children?: unknown[] }>).flatMap(walk)];
    const nodes = walk(plainTextToLexical("<script>alert(1)</script>\n\n**bold** <b>x</b>\n\n- a\n- b\n\nhttps://example.com").root as never);
    expect(nodes.every((type) => allowed.has(type))).toBe(true);
    expect(JSON.stringify(plainTextToLexical("<script>alert(1)</script>"))).toContain("<script>alert(1)</script>");
  });

  it("trims, normalizes newlines, drops control characters and caps the length", () => {
    expect(children("  \r\n\r\n  Hello\r\nworld  \r\n").length).toBe(1);
    expect(lexicalToPlainText(plainTextToLexical("a\u0000b"))).toBe("ab");
    expect(lexicalToPlainText(plainTextToLexical("x".repeat(LIVE_TEXT_MAX + 500))).length).toBe(LIVE_TEXT_MAX);
    expect(children("   \n\n  ")).toHaveLength(0);
  });

  it("round-trips what the desk writes", () => {
    const source = "Doors open at six.\nBand at seven.\n\n- Parking is free\n- Tickets at the door\n\nDetails: https://example.com/show";
    expect(lexicalToPlainText(plainTextToLexical(source))).toBe(source);
  });

  it("reads other prose back as text and tolerates anything else", () => {
    const body = { root: { type: "root", children: [{ type: "heading", tag: "h2", children: [{ type: "text", text: "Title" }] }, { type: "list", listType: "number", children: [{ type: "listitem", value: 1, children: [{ type: "text", text: "One" }] }] }] } };
    expect(lexicalToPlainText(body)).toBe("Title\n\n1. One");
    for (const value of [null, undefined, "x", 3, {}, { root: null }]) expect(lexicalToPlainText(value)).toBe("");
  });
});
