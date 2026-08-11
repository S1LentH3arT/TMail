import type { AccountRepository } from "../accounts/account-repository.js";
import { TmailError } from "../domain/errors.js";
import type { Message, MessagePage } from "../domain/message.js";
import type { MailProvider } from "../providers/provider.js";

export interface PageOptions {
  readonly limit?: number;
  readonly cursor?: string;
  readonly signal?: AbortSignal;
}

export class MailService {
  readonly #providers = new Map<string, MailProvider>();

  public constructor(
    private readonly accounts: AccountRepository,
    providers: readonly MailProvider[],
  ) {
    for (const provider of providers) {
      this.#providers.set(provider.provider, provider);
    }
  }

  async #providerFor(accountId: string): Promise<MailProvider> {
    const account = await this.accounts.get(accountId);
    const provider = this.#providers.get(account.provider);
    if (!provider) {
      throw new TmailError(
        "PROVIDER_NOT_AVAILABLE",
        `${account.provider} support is not available in this build.`,
      );
    }
    return provider;
  }

  public async list(accountId: string, options: PageOptions = {}): Promise<MessagePage> {
    const provider = await this.#providerFor(accountId);
    return provider.listMessages({
      accountId,
      limit: options.limit ?? 30,
      ...(options.cursor ? { cursor: options.cursor } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  }

  public async search(
    accountId: string,
    query: string,
    options: PageOptions = {},
  ): Promise<MessagePage> {
    const provider = await this.#providerFor(accountId);
    return provider.searchMessages({
      accountId,
      query,
      limit: options.limit ?? 30,
      ...(options.cursor ? { cursor: options.cursor } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  }

  public async read(accountId: string, messageId: string, signal?: AbortSignal): Promise<Message> {
    const provider = await this.#providerFor(accountId);
    return provider.readMessage({ accountId, messageId, ...(signal ? { signal } : {}) });
  }
}
