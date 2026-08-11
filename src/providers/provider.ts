import type { AccountProvider } from "../domain/account.js";
import type { Message, MessagePage } from "../domain/message.js";

export interface ProviderCapabilities {
  readonly listInbox: boolean;
  readonly readMessage: boolean;
  readonly searchInbox: boolean;
  readonly attachmentMetadata: boolean;
  readonly remoteWrites: false;
}

export interface ListMessagesInput {
  readonly accountId: string;
  readonly limit: number;
  readonly cursor?: string;
  readonly signal?: AbortSignal;
}

export interface SearchMessagesInput extends ListMessagesInput {
  readonly query: string;
}

export interface ReadMessageInput {
  readonly accountId: string;
  readonly messageId: string;
  readonly signal?: AbortSignal;
}

export interface MailProvider {
  readonly provider: AccountProvider;
  readonly capabilities: ProviderCapabilities;
  listMessages(input: ListMessagesInput): Promise<MessagePage>;
  searchMessages(input: SearchMessagesInput): Promise<MessagePage>;
  readMessage(input: ReadMessageInput): Promise<Message>;
}

export const READ_ONLY_CAPABILITIES: ProviderCapabilities = {
  listInbox: true,
  readMessage: true,
  searchInbox: true,
  attachmentMetadata: true,
  remoteWrites: false,
};
