import { describe, expect, it } from "vitest";
import { normalizeBody } from "../src/body/normalize.js";
import { renderBody } from "../src/tui/render-body.js";

describe("body normalization", () => {
  it("treats plain text as text rather than author-controlled Markdown", async () => {
    const body = await normalizeBody({ kind: "plain", content: "*not emphasis*\n\u001B[31mred" });

    expect(body.markdown).toContain("\\*not emphasis\\*");
    expect(body.markdown).not.toContain("\u001B");
  });

  it("sanitizes HTML and numbers safe links for terminal rendering", async () => {
    const body = await normalizeBody({
      kind: "html",
      content:
        '<h1>Hello</h1><script>danger()</script><img src="https://tracker.invalid/pixel"><a href="https://example.test">Open</a>',
    });
    const rendered = renderBody(body.root);

    expect(body.markdown).toContain("# Hello");
    expect(body.markdown).not.toContain("danger");
    expect(body.markdown).not.toContain("tracker.invalid");
    expect(rendered.lines.join("\n")).toContain("Open [1]");
    expect(rendered.links).toEqual(["https://example.test"]);
  });
});
