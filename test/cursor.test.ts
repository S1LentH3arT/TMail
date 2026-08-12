import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "../src/providers/cursor.js";

describe("provider cursors", () => {
  const context = {
    provider: "gmail" as const,
    accountId: "acc_AAAAAAAAAAAAAAAAAAAAAA",
    operation: "search" as const,
    query: "from:alerts@example.com",
  };

  it("round trips a provider token only for the bound request context", () => {
    const cursor = encodeCursor(context, "provider-page-token");

    expect(decodeCursor(context, cursor)).toBe("provider-page-token");
    expect(() => decodeCursor({ ...context, query: "is:unread" }, cursor)).toThrowError(
      expect.objectContaining({ code: "INVALID_ARGUMENT" }),
    );
    expect(() =>
      decodeCursor({ ...context, accountId: "acc_BBBBBBBBBBBBBBBBBBBBBB" }, cursor),
    ).toThrowError(expect.objectContaining({ code: "INVALID_ARGUMENT" }));
  });
});
