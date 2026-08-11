import { describe, expect, it } from "vitest";
import { ACCOUNT_ID_PATTERN, createAccountId } from "../src/domain/account.js";

describe("account IDs", () => {
  it("creates opaque IDs with the stable public shape", () => {
    const first = createAccountId();
    const second = createAccountId();

    expect(first).toMatch(ACCOUNT_ID_PATTERN);
    expect(second).toMatch(ACCOUNT_ID_PATTERN);
    expect(first).not.toBe(second);
    expect(first).not.toContain("@");
  });
});
