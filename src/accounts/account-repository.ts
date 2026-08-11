import type { Account } from "../domain/account.js";
import { TmailError } from "../domain/errors.js";

export interface AccountRepository {
  list(): Promise<readonly Account[]>;
  get(accountId: string): Promise<Account>;
}

const DEMO_ACCOUNT: Account = {
  id: "acc_AAAAAAAAAAAAAAAAAAAAAA",
  address: "demo@tmail.local",
  displayName: "TMail Demo",
  provider: "demo",
  status: "connected",
};

export class RuntimeAccountRepository implements AccountRepository {
  public constructor(private readonly demoEnabled = process.env.TMAIL_ENABLE_DEMO === "1") {}

  public async list(): Promise<readonly Account[]> {
    return this.demoEnabled ? [DEMO_ACCOUNT] : [];
  }

  public async get(accountId: string): Promise<Account> {
    const account = (await this.list()).find((candidate) => candidate.id === accountId);
    if (!account) {
      throw new TmailError("ACCOUNT_NOT_FOUND", `Account '${accountId}' was not found.`);
    }
    return account;
  }
}
