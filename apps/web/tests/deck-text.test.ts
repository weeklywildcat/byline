import { describe, expect, it } from "vitest";
import { cleanDeckText, stripBracketedEllipsis, stripTrailingEllipsis } from "@byline/ui";

// The deck helpers are shared by both hosts, so their output is a parity
// contract: the More rail and the Sports lead must read identically in Studio
// and on the published page.
//
// They are also the reason this file has a timing test. The original
// implementation used `\s*<ellipsis>\s*$` patterns, which backtrack from every
// position in a run of whitespace and are quadratic in the length of the
// excerpt -- publication text this code does not control. The replacement scans
// linearly; the guard below fails long before a reintroduced regex would.

describe("bracketed excerpt markers", () => {
  it("removes WordPress's marker in all three spellings", () => {
    expect(stripBracketedEllipsis("A story [&hellip;]")).toBe("A story");
    expect(stripBracketedEllipsis("A story […]")).toBe("A story");
    expect(stripBracketedEllipsis("A story [...]")).toBe("A story");
    expect(stripBracketedEllipsis("A story [ &hellip; ]  ")).toBe("A story");
    expect(stripBracketedEllipsis("A story [&HELLIP;]")).toBe("A story");
  });

  it("leaves anything that is not the trailing marker alone", () => {
    expect(stripBracketedEllipsis("A story [see note]")).toBe("A story [see note]");
    expect(stripBracketedEllipsis("A [&hellip;] story")).toBe("A [&hellip;] story");
    expect(stripBracketedEllipsis("A story")).toBe("A story");
    expect(stripBracketedEllipsis("")).toBe("");
  });
});

describe("bare trailing ellipses", () => {
  it("removes one trailing ellipsis and the whitespace around it", () => {
    expect(stripTrailingEllipsis("A story…")).toBe("A story");
    expect(stripTrailingEllipsis("A story ...")).toBe("A story");
    expect(stripTrailingEllipsis("A story &hellip;  ")).toBe("A story");
    // Only the final three dots go, exactly as the pattern it replaced did.
    expect(stripTrailingEllipsis("A story.....")).toBe("A story..");
  });

  it("leaves a normal full stop alone", () => {
    expect(stripTrailingEllipsis("A story.")).toBe("A story.");
    expect(stripTrailingEllipsis("A story..")).toBe("A story..");
  });
});

describe("the clean deck treatment", () => {
  it("keeps at most the first two sentences", () => {
    expect(cleanDeckText("One here. Two here. Three here.")).toBe("One here.  Two here.");
    expect(cleanDeckText("Only one here.")).toBe("Only one here.");
    expect(cleanDeckText("Ends in a bang! And a question? And more.")).toBe("Ends in a bang!  And a question?");
  });

  it("requires whitespace or the end of the text after a terminator", () => {
    // "a." is not a sentence here because "b" follows the full stop, which is
    // how the treatment survives decimals and abbreviations run together.
    expect(cleanDeckText("a.b. c.")).toBe("b.  c.");
  });

  it("strips the excerpt marker before looking for sentences", () => {
    expect(cleanDeckText("One here. Two here. [&hellip;]")).toBe("One here.  Two here.");
    expect(cleanDeckText("No terminator here [&hellip;]")).toBe("No terminator here");
  });

  it("falls back to a truncated run of text when nothing terminates", () => {
    const long = "word ".repeat(80).trim();

    expect(cleanDeckText(long).endsWith("...")).toBe(true);
    expect(cleanDeckText(long).length).toBeLessThanOrEqual(263);
    expect(cleanDeckText("short enough")).toBe("short enough");
  });

  it("stays linear on adversarial publication text", () => {
    // The pattern this replaced took ~10s on this input and grew quadratically.
    const adversarial = `a${" ".repeat(80_000)}!`;
    const started = performance.now();

    cleanDeckText(adversarial);

    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
