import { describe, expect, it } from "vitest";
import { renderNetscapeBookmarks } from "./renderNetscapeBookmarks";

describe("browser-compatible HTML export", () => {
  it("escapes folder names, URLs, descriptions and labels", () => {
    const html = renderNetscapeBookmarks({ collections: [{
      name: "Work & Notes", links: [{
        url: "https://example.org/?a=1&b=2", name: "A < B",
        description: '"My paper"', createdAt: "2023-11-14T22:13:20Z",
        tags: [{ name: "science" }, { name: "work" }],
      }],
    }] });
    expect(html).toContain("<H3>Work &amp; Notes</H3>");
    expect(html).toContain('HREF="https://example.org/?a=1&amp;b=2"');
    expect(html).toContain('ADD_DATE="1700000000"');
    expect(html).toContain('TAGS="science,work"');
    expect(html).toContain(">A &lt; B</A>");
    expect(html).toContain("<DD>&quot;My paper&quot;");
  });
  it("excludes URL-less notes and unsafe links", () => {
    const html = renderNetscapeBookmarks({ collections: [{
      name: "Reading", links: [
        { name: "Note", url: null },
        { name: "Script", url: "javascript:alert(1)" },
        { name: "Credential", url: "https://a:b@example.org/" },
        { name: "Safe", url: "https://example.org/" },
      ],
    }] });
    expect(html.match(/<DT><A /g)).toHaveLength(1);
  });
  it("does not emit executable user-authored markup", () => {
    const html = renderNetscapeBookmarks({ collections: [{
      name: "<script>boom</script>",
      links: [{ name: "<img src=x>", url: "https://example.org/" }],
    }] });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
});
