import { describe, expect, it } from "vitest";
import { DemoProvider } from "../src/providers/demo/demo-provider.js";

describe("DemoProvider contract", () => {
  const provider = new DemoProvider();

  it("lists one actual message per summary and supports opaque cursors", async () => {
    const first = await provider.listMessages({ accountId: "account", limit: 2 });
    const second = await provider.listMessages({
      accountId: "account",
      limit: 2,
      cursor: first.nextCursor,
    });

    expect(first.messages).toHaveLength(2);
    expect(first.nextCursor).toBe("2");
    expect(second.messages).toHaveLength(1);
    expect(new Set([...first.messages, ...second.messages].map((message) => message.id)).size).toBe(
      3,
    );
  });

  it("searches sender, subject, and snippet without mutating remote state", async () => {
    const page = await provider.searchMessages({ accountId: "account", query: "中文", limit: 30 });
    expect(page.messages.map((message) => message.id)).toEqual(["demo-unicode"]);
  });

  it("returns attachment metadata without attachment payloads", async () => {
    const message = await provider.readMessage({ accountId: "account", messageId: "demo-html" });
    expect(message.attachments).toEqual([
      expect.objectContaining({ filename: "build-summary.txt", size: 1_024 }),
    ]);
    expect(message).not.toHaveProperty("attachmentContent");
  });
});
