import { z } from "zod";
import { TmailError } from "../../domain/errors.js";
import type { Message, MessagePage, MessageSummary } from "../../domain/message.js";
import { decodeCursor, encodeCursor } from "../cursor.js";
import { authorizedJson } from "../http.js";
import type {
  ListMessagesInput,
  MailProvider,
  ReadMessageInput,
  SearchMessagesInput,
} from "../provider.js";
import { READ_ONLY_CAPABILITIES } from "../provider.js";
import { parseGmailMessage } from "./message-parser.js";
import type { GmailTokenProvider } from "./token-provider.js";

const listResponseSchema = z.object({
  messages: z.array(z.object({ id: z.string().min(1) })).optional(),
  nextPageToken: z.string().optional(),
});

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

export class GmailProvider implements MailProvider {
  public readonly provider = "gmail" as const;
  public readonly capabilities = READ_ONLY_CAPABILITIES;

  public constructor(private readonly tokens: GmailTokenProvider) {}

  public async listMessages(input: ListMessagesInput): Promise<MessagePage> {
    return this.#list(input, undefined);
  }

  public async searchMessages(input: SearchMessagesInput): Promise<MessagePage> {
    return this.#list(input, input.query);
  }

  public async readMessage(input: ReadMessageInput): Promise<Message> {
    const url = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(input.messageId)}`,
    );
    url.searchParams.set("format", "full");
    const raw = await authorizedJson<unknown>({
      url,
      getAccessToken: (force) => this.tokens.get(input.accountId, force),
      notFoundCode: "MESSAGE_NOT_FOUND",
      onAuthenticationRequired: () => this.tokens.invalidate(input.accountId),
      ...(input.signal ? { signal: input.signal } : {}),
    });
    return parseGmailMessage(raw);
  }

  async #list(input: ListMessagesInput, query?: string): Promise<MessagePage> {
    const operation: "list" | "search" = query === undefined ? "list" : "search";
    const cursorContext = {
      provider: "gmail" as const,
      accountId: input.accountId,
      operation,
      ...(query !== undefined ? { query } : {}),
    };
    const providerCursor = decodeCursor(cursorContext, input.cursor);
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("labelIds", "INBOX");
    url.searchParams.set("includeSpamTrash", "false");
    url.searchParams.set("maxResults", String(Math.min(input.limit, 500)));
    if (providerCursor) {
      url.searchParams.set("pageToken", providerCursor);
    }
    if (query !== undefined) {
      url.searchParams.set("q", query);
    }
    const raw = await authorizedJson<unknown>({
      url,
      getAccessToken: (force) => this.tokens.get(input.accountId, force),
      onAuthenticationRequired: () => this.tokens.invalidate(input.accountId),
      ...(query !== undefined ? { invalidArgumentCode: "QUERY_INVALID" as const } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    });
    const parsed = listResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new TmailError(
        "PROVIDER_RESPONSE_INVALID",
        "Gmail returned an invalid message list.",
        false,
        { cause: parsed.error },
      );
    }
    const messages: MessageSummary[] = [];
    for (const item of parsed.data.messages ?? []) {
      input.signal?.throwIfAborted();
      messages.push(
        toSummary(
          await this.readMessage({
            accountId: input.accountId,
            messageId: item.id,
            ...(input.signal ? { signal: input.signal } : {}),
          }),
        ),
      );
    }
    return {
      messages,
      ...(parsed.data.nextPageToken
        ? { nextCursor: encodeCursor(cursorContext, parsed.data.nextPageToken) }
        : {}),
    };
  }
}
