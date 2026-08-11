import stringWidth from "string-width";
import { describe, expect, it } from "vitest";
import { padToWidth, truncateToWidth } from "../src/tui/format.js";

describe("terminal width formatting", () => {
  it("truncates CJK text by display width rather than UTF-16 length", () => {
    const value = truncateToWidth("中文邮件测试", 7);
    expect(stringWidth(value)).toBeLessThanOrEqual(7);
    expect(value).toBe("中文邮…");
  });

  it("pads values to an exact display width", () => {
    expect(stringWidth(padToWidth("王小明", 10))).toBe(10);
  });
});
