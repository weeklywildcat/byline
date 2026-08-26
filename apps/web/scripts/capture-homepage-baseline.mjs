// Captures a structural snapshot of the rendered homepage.
//
// This is the compatibility target for the design-driven homepage: the package
// order, the heading text, the story counts and the story identities must all
// survive the migration from the hand-written page.tsx to shared package
// renderers. Pixels are captured separately; this snapshot is what makes a
// regression reviewable in a diff.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_HTML = path.join(process.cwd(), "out", "index.html");
const TARGET = path.join(process.cwd(), "tests", "baseline", "homepage-structure.json");

const html = await readFile(OUT_HTML, "utf8");

// Top-level packages are the <section> elements directly inside the home shell.
const sections = [...html.matchAll(/<section\b([^>]*)>/g)].map((match) => match[1]);

function attr(tag, name) {
  return new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
}

const packages = sections.map((tag) => ({
  className: attr(tag, "class"),
  ariaLabel: attr(tag, "aria-label"),
  ariaLabelledBy: attr(tag, "aria-labelledby"),
  id: attr(tag, "id")
}));

// Headline text is the most human-readable proof that story selection and
// ordering did not shift.
const headlines = [...html.matchAll(/<h[23][^>]*>(?:(?!<\/h[23]>).)*?<\/h[23]>/g)]
  .map((match) => match[0].replace(/<[^>]+>/g, "").trim())
  .filter(Boolean);

// Split the shell into top-level packages so stories can be attributed to the
// package that rendered them. A single story card links to its article several
// times (image, headline, read-more), so raw href counting cannot detect a
// genuine cross-package repeat -- links must be de-duplicated within a package
// first.
const shell = /<main\b[^>]*>([\s\S]*)<\/main>/.exec(html)?.[1] ?? html;
const packageChunks = shell.split(/(?=<section\b)/).filter((chunk) => chunk.startsWith("<section"));

const storiesByPackage = packageChunks.map((chunk) => {
  const className = attr(/<section\b([^>]*)>/.exec(chunk)?.[1] ?? "", "class");
  const links = [...chunk.matchAll(/href="(\/\d{4}\/\d{2}\/\d{2}\/[^"]+)"/g)].map((match) => match[1]);

  return { className, stories: [...new Set(links)] };
});

const articleLinks = storiesByPackage.flatMap((entry) => entry.stories);

const snapshot = {
  capturedFrom: "pre-studio page.tsx",
  packageCount: packages.length,
  packages,
  headings: headlines,
  storyOrder: [...new Set(articleLinks)],
  storiesByPackage,
  // De-duplication is a homepage-wide invariant: no story may appear in two
  // packages. A repeat here is a regression even if every package looks right.
  duplicateStories: [...new Set(articleLinks.filter((link, index) => articleLinks.indexOf(link) !== index))]
};

await writeFile(TARGET, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Captured homepage baseline: ${snapshot.packageCount} packages, ${snapshot.storyOrder.length} unique stories.`);
