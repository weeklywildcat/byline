import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import IntranetPage, { INTRANET_URL, metadata } from "@/views/intranet/page";

describe("staff intranet page", () => {
  it("tells staff to sign in with their Workspace account and links the intranet", () => {
    const markup = renderToStaticMarkup(<IntranetPage />);

    expect(markup).toContain("@weeklywildcat.com");
    expect(markup).toContain(`href="${INTRANET_URL}"`);
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain('id="intranet-breadcrumb-json-ld"');
    expect(INTRANET_URL).not.toContain("authuser");
  });

  it("is canonical at /intranet/ and kept out of search results", () => {
    expect(metadata.alternates?.canonical).toContain("/intranet/");
    expect(metadata.robots).toMatchObject({ index: false });
  });
});
