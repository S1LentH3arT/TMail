import { TmailError } from "../../domain/errors.js";
import type { Message, MessagePage, MessageSummary } from "../../domain/message.js";
import type {
  ListMessagesInput,
  MailProvider,
  ReadMessageInput,
  SearchMessagesInput,
} from "../provider.js";
import { READ_ONLY_CAPABILITIES } from "../provider.js";

const messages: readonly Message[] = [
  {
    id: "demo-welcome",
    threadId: "demo-thread-welcome",
    sender: { name: "TMail Team", address: "hello@tmail.local" },
    to: [{ address: "demo@tmail.local" }],
    cc: [],
    subject: "Welcome to TMail",
    snippet: "Your agent-friendly terminal inbox is ready.",
    receivedAt: "2026-08-11T01:30:00.000Z",
    unread: true,
    hasAttachments: false,
    headers: {
      "message-id": "<demo-welcome@tmail.local>",
      "content-type": "text/plain; charset=utf-8",
    },
    body: {
      kind: "plain",
      content:
        "Welcome to TMail.\n\nUse ↑/↓ or j/k to move, Enter to read, / to search, and Esc to return.",
    },
    attachments: [],
  },
  {
    id: "demo-html",
    threadId: "demo-thread-html",
    sender: { name: "Build Robot", address: "builds@example.test" },
    to: [{ name: "TMail Demo", address: "demo@tmail.local" }],
    cc: [{ address: "team@example.test" }],
    subject: "Build #42 passed",
    snippet: "All checks passed. Review the build summary.",
    receivedAt: "2026-08-10T15:04:00.000Z",
    unread: false,
    hasAttachments: true,
    headers: {
      "message-id": "<build-42@example.test>",
      "content-type": "text/html; charset=utf-8",
    },
    body: {
      kind: "html",
      content:
        '<h1>Build passed</h1><p>All checks passed.</p><ul><li>Types</li><li>Tests</li></ul><p><a href="https://example.test/build/42">Review build</a></p><img src="https://tracker.invalid/pixel"><script>alert(\'no\')</script>',
    },
    attachments: [
      {
        id: "demo-attachment-1",
        filename: "build-summary.txt",
        contentType: "text/plain",
        size: 1_024,
        inline: false,
      },
    ],
  },
  {
    id: "demo-unicode",
    sender: { name: "王小明", address: "xiaoming@example.test" },
    to: [{ address: "demo@tmail.local" }],
    cc: [],
    subject: "终端邮件阅读测试",
    snippet: "这是一封用于验证 Unicode 宽度与中文正文的合成邮件。",
    receivedAt: "2026-08-09T03:20:00.000Z",
    unread: true,
    hasAttachments: false,
    headers: {
      "message-id": "<unicode@example.test>",
      "content-type": "text/plain; charset=utf-8",
    },
    body: {
      kind: "plain",
      content: "你好，TMail！\n\n这是一封完全合成的演示邮件，不包含任何真实用户数据。",
    },
    attachments: [],
  },
];

function toSummary(message: Message): MessageSummary {
  const {
    to: _to,
    cc: _cc,
    headers: _headers,
    body: _body,
    attachments: _attachments,
    ...summary
  } = message;
  return summary;
}

function page(items: readonly Message[], input: ListMessagesInput): MessagePage {
  const offset = input.cursor ? Number.parseInt(input.cursor, 10) : 0;
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new TmailError("INVALID_ARGUMENT", "The cursor is invalid.");
  }

  const selected = items.slice(offset, offset + input.limit).map(toSummary);
  const nextOffset = offset + selected.length;
  return {
    messages: selected,
    ...(nextOffset < items.length ? { nextCursor: String(nextOffset) } : {}),
  };
}

export class DemoProvider implements MailProvider {
  public readonly provider = "demo" as const;
  public readonly capabilities = READ_ONLY_CAPABILITIES;

  public async listMessages(input: ListMessagesInput): Promise<MessagePage> {
    input.signal?.throwIfAborted();
    return page(messages, input);
  }

  public async searchMessages(input: SearchMessagesInput): Promise<MessagePage> {
    input.signal?.throwIfAborted();
    const query = input.query.trim().toLocaleLowerCase();
    const results = messages.filter((message) =>
      [message.sender.name, message.sender.address, message.subject, message.snippet]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(query)),
    );
    return page(results, input);
  }

  public async readMessage(input: ReadMessageInput): Promise<Message> {
    input.signal?.throwIfAborted();
    const message = messages.find((candidate) => candidate.id === input.messageId);
    if (!message) {
      throw new TmailError("MESSAGE_NOT_FOUND", `Message '${input.messageId}' was not found.`);
    }
    return message;
  }
}
