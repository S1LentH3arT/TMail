import { z } from "zod";
import type { AttachmentMetadata, MailAddress, Message } from "../../domain/message.js";
import { TmailError } from "../../domain/errors.js";

const headerSchema = z.object({ name: z.string(), value: z.string() });
const bodySchema = z.object({
  attachmentId: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  data: z.string().optional(),
});
type GmailPart = {
  readonly partId?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly filename?: string | undefined;
  readonly headers?: readonly z.infer<typeof headerSchema>[] | undefined;
  readonly body?: z.infer<typeof bodySchema> | undefined;
  readonly parts?: readonly GmailPart[] | undefined;
};
const partSchema: z.ZodType<GmailPart> = z.lazy(() =>
  z.object({
    partId: z.string().optional(),
    mimeType: z.string().optional(),
    filename: z.string().optional(),
    headers: z.array(headerSchema).optional(),
    body: bodySchema.optional(),
    parts: z.array(partSchema).optional(),
  }),
);
const gmailMessageSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().optional(),
  labelIds: z.array(z.string()).optional(),
  snippet: z.string().optional(),
  internalDate: z.string().optional(),
  payload: partSchema.optional(),
});

function headerMap(part?: GmailPart): ReadonlyMap<string, string> {
  return new Map((part?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
}

function splitAddresses(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  let angleDepth = 0;
  for (const character of value) {
    if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === "<") {
      angleDepth += 1;
    } else if (!quoted && character === ">") {
      angleDepth = Math.max(0, angleDepth - 1);
    }
    if (character === "," && !quoted && angleDepth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim()) {
    parts.push(current);
  }
  return parts;
}

function parseAddress(value: string): MailAddress {
  const match = value.trim().match(/^(?:"?([^"<]*)"?\s*)?<([^<>]+)>$/u);
  if (match) {
    const name = match[1]?.trim();
    return { address: match[2]?.trim() || null, ...(name ? { name } : {}) };
  }
  const plain = value.trim();
  return plain.includes("@")
    ? { address: plain }
    : { address: null, ...(plain ? { name: plain } : {}) };
}

function addresses(value?: string): readonly MailAddress[] {
  return value ? splitAddresses(value).map(parseAddress) : [];
}

function decode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function allParts(root?: GmailPart): GmailPart[] {
  if (!root) {
    return [];
  }
  return [root, ...(root.parts ?? []).flatMap(allParts)];
}

function contentDisposition(part: GmailPart): string {
  return headerMap(part).get("content-disposition")?.toLowerCase() ?? "";
}

function attachmentMetadata(messageId: string, parts: readonly GmailPart[]): AttachmentMetadata[] {
  return parts
    .filter((part) => {
      const disposition = contentDisposition(part);
      return Boolean(
        part.body?.attachmentId || part.filename || disposition.includes("attachment"),
      );
    })
    .map((part, index) => {
      const disposition = contentDisposition(part);
      const inline = disposition.includes("inline") || headerMap(part).has("content-id");
      return {
        id: part.body?.attachmentId ?? `${messageId}:${part.partId ?? index}`,
        filename: part.filename?.trim() || null,
        contentType: part.mimeType || "application/octet-stream",
        size: part.body?.size ?? 0,
        inline,
      };
    });
}

function body(parts: readonly GmailPart[]): Message["body"] {
  const contentPart =
    parts.find((part) => part.mimeType?.toLowerCase() === "text/html" && part.body?.data) ??
    parts.find((part) => part.mimeType?.toLowerCase() === "text/plain" && part.body?.data);
  if (!contentPart?.body?.data) {
    return null;
  }
  return {
    kind: contentPart.mimeType?.toLowerCase() === "text/html" ? "html" : "plain",
    content: decode(contentPart.body.data),
  };
}

export function parseGmailMessage(value: unknown): Message {
  const parsed = gmailMessageSchema.safeParse(value);
  if (!parsed.success) {
    throw new TmailError("PROVIDER_RESPONSE_INVALID", "Gmail returned an invalid message.", false, {
      cause: parsed.error,
    });
  }
  const message = parsed.data;
  const headers = headerMap(message.payload);
  const parts = allParts(message.payload);
  const attachments = attachmentMetadata(message.id, parts);
  const internalDate = message.internalDate
    ? Number.parseInt(message.internalDate, 10)
    : Number.NaN;
  const receivedAt = Number.isFinite(internalDate) ? new Date(internalDate).toISOString() : null;
  const allowedHeaders = ["message-id", "content-type", "in-reply-to", "references"] as const;
  return {
    id: message.id,
    ...(message.threadId ? { threadId: message.threadId } : {}),
    sender: addresses(headers.get("from"))[0] ?? { address: null },
    to: addresses(headers.get("to")),
    cc: addresses(headers.get("cc")),
    subject: headers.get("subject")?.trim() || null,
    snippet: message.snippet?.trim() || null,
    receivedAt,
    unread: message.labelIds?.includes("UNREAD") ?? false,
    hasAttachments: attachments.some((attachment) => !attachment.inline),
    headers: Object.fromEntries(
      allowedHeaders.flatMap((name) => {
        const value = headers.get(name);
        return value ? [[name, value] as const] : [];
      }),
    ),
    body: body(parts),
    attachments,
  };
}
