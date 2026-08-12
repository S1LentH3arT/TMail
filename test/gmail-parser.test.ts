import { describe, expect, it } from "vitest";
import { parseGmailMessage } from "../src/providers/gmail/message-parser.js";

function encoded(value: string): string {
  return Buffer.from(value).toString("base64url");
}

describe("Gmail message mapping", () => {
  it("prefers HTML, keeps one message, and distinguishes inline attachments", () => {
    const message = parseGmailMessage({
      id: "gmail-message-1",
      threadId: "gmail-thread-1",
      labelIds: ["INBOX", "UNREAD"],
      snippet: "A safe preview",
      internalDate: "1786464000000",
      payload: {
        mimeType: "multipart/mixed",
        headers: [
          { name: "From", value: '"Build Robot" <builds@example.test>' },
          { name: "To", value: "reader@example.com" },
          { name: "Subject", value: "Build passed" },
          { name: "Message-ID", value: "<build@example.test>" },
          { name: "Received", value: "private routing details" },
        ],
        parts: [
          { mimeType: "text/plain", body: { data: encoded("Plain fallback") } },
          {
            mimeType: "text/html",
            body: { data: encoded('<p>Hello</p><img src="https://tracker.invalid">') },
          },
          {
            partId: "3",
            mimeType: "image/png",
            filename: "signature.png",
            headers: [
              { name: "Content-Disposition", value: "inline" },
              { name: "Content-ID", value: "<signature>" },
            ],
            body: { attachmentId: "inline-1", size: 128 },
          },
          {
            partId: "4",
            mimeType: "application/pdf",
            filename: "report.pdf",
            headers: [{ name: "Content-Disposition", value: "attachment" }],
            body: { attachmentId: "attachment-1", size: 1024 },
          },
        ],
      },
    });

    expect(message).toMatchObject({
      id: "gmail-message-1",
      threadId: "gmail-thread-1",
      sender: { name: "Build Robot", address: "builds@example.test" },
      subject: "Build passed",
      unread: true,
      hasAttachments: true,
      body: { kind: "html" },
    });
    expect(message.attachments.map(({ id, inline }) => ({ id, inline }))).toEqual([
      { id: "inline-1", inline: true },
      { id: "attachment-1", inline: false },
    ]);
    expect(message.headers).toEqual({ "message-id": "<build@example.test>" });
  });

  it("uses nulls rather than fabricated data for missing real-world headers", () => {
    const message = parseGmailMessage({ id: "minimal", payload: {} });

    expect(message.sender.address).toBeNull();
    expect(message.subject).toBeNull();
    expect(message.receivedAt).toBeNull();
    expect(message.body).toBeNull();
  });
});
