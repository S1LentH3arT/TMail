export interface MailAddress {
  readonly name?: string;
  readonly address: string | null;
}

export interface AttachmentMetadata {
  readonly id: string;
  readonly filename: string | null;
  readonly contentType: string;
  readonly size: number;
  readonly inline: boolean;
}

export interface MessageSummary {
  readonly id: string;
  readonly threadId?: string;
  readonly sender: MailAddress;
  readonly subject: string | null;
  readonly snippet: string | null;
  readonly receivedAt: string | null;
  readonly unread: boolean;
  readonly hasAttachments: boolean;
}

export interface Message extends MessageSummary {
  readonly to: readonly MailAddress[];
  readonly cc: readonly MailAddress[];
  readonly headers: Readonly<Record<string, string>>;
  readonly body: MessageBody | null;
  readonly attachments: readonly AttachmentMetadata[];
}

export type MessageBody =
  | { readonly kind: "plain"; readonly content: string; readonly truncated?: boolean }
  | { readonly kind: "html"; readonly content: string; readonly truncated?: boolean };

export interface MessagePage {
  readonly messages: readonly MessageSummary[];
  readonly nextCursor?: string;
}
