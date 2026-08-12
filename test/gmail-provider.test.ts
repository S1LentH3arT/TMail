import { afterEach, describe, expect, it, vi } from "vitest";
import { GmailProvider } from "../src/providers/gmail/gmail-provider.js";
import type { GmailTokenProvider } from "../src/providers/gmail/token-provider.js";

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GmailProvider contract", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("searches only Inbox messages and returns a request-bound opaque cursor", async () => {
    const requests: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        requests.push(url);
        if (url.pathname.endsWith("/messages")) {
          return json({ messages: [{ id: "message-1" }], nextPageToken: "gmail-next-page" });
        }
        return json({
          id: "message-1",
          threadId: "thread-1",
          labelIds: ["INBOX"],
          internalDate: "1786464000000",
          payload: {
            mimeType: "text/plain",
            headers: [
              { name: "From", value: "sender@example.test" },
              { name: "Subject", value: "Status" },
            ],
            body: { data: Buffer.from("Ready").toString("base64url") },
          },
        });
      }),
    );
    const tokens = {
      get: vi.fn(async () => "access-token"),
      invalidate: vi.fn(async () => undefined),
    } as unknown as GmailTokenProvider;
    const provider = new GmailProvider(tokens);

    const page = await provider.searchMessages({
      accountId: "acc_AAAAAAAAAAAAAAAAAAAAAA",
      query: "from:sender@example.test",
      limit: 30,
    });

    expect(page.messages).toHaveLength(1);
    expect(page.nextCursor).toBeTypeOf("string");
    expect(page.nextCursor).not.toContain("gmail-next-page");
    expect(requests[0]?.searchParams.get("labelIds")).toBe("INBOX");
    expect(requests[0]?.searchParams.get("q")).toBe("from:sender@example.test");
    expect(requests[1]?.searchParams.get("format")).toBe("full");
  });

  it("refreshes once after a 401 and then marks authentication as required", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "unauthorized" }, 401)),
    );
    const tokens = {
      get: vi.fn(async () => "access-token"),
      invalidate: vi.fn(async () => undefined),
    } as unknown as GmailTokenProvider;
    const provider = new GmailProvider(tokens);

    await expect(
      provider.readMessage({
        accountId: "acc_AAAAAAAAAAAAAAAAAAAAAA",
        messageId: "message-1",
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    expect(tokens.get).toHaveBeenNthCalledWith(1, "acc_AAAAAAAAAAAAAAAAAAAAAA", false);
    expect(tokens.get).toHaveBeenNthCalledWith(2, "acc_AAAAAAAAAAAAAAAAAAAAAA", true);
    expect(tokens.invalidate).toHaveBeenCalledWith("acc_AAAAAAAAAAAAAAAAAAAAAA");
  });
});
