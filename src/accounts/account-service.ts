import { createHash } from "node:crypto";
import type { Account } from "../domain/account.js";
import { createAccountId } from "../domain/account.js";
import { TmailError } from "../domain/errors.js";
import type { GmailAuthorizationResult } from "../providers/gmail/authenticator.js";
import { parseGmailCredential, serializeGmailCredential } from "../providers/gmail/credential.js";
import type { CredentialStore } from "../credentials/credential-store.js";
import type { AccountRepository, MutableAccountRepository } from "./account-repository.js";

export class AccountService implements AccountRepository {
  public constructor(
    private readonly repository: MutableAccountRepository,
    private readonly credentials: CredentialStore,
  ) {}

  public async list(): Promise<readonly Account[]> {
    const accounts = await this.repository.list();
    return Promise.all(
      accounts.map(async (account) => {
        if (account.provider === "demo") {
          return account;
        }
        const credential = await this.credentials.get(account.id);
        return credential
          ? account
          : {
              ...account,
              status: "needs-authentication" as const,
            };
      }),
    );
  }

  public async get(accountId: string): Promise<Account> {
    const account = (await this.list()).find((candidate) => candidate.id === accountId);
    if (!account) {
      throw new TmailError("ACCOUNT_NOT_FOUND", `Account '${accountId}' was not found.`);
    }
    return account;
  }

  public async connectGmail(result: GmailAuthorizationResult): Promise<Account> {
    const identityKey = createHash("sha256").update(`gmail:${result.subject}`).digest("base64url");
    let writtenAccountId: string | undefined;
    let previousCredential: string | null = null;
    try {
      return await this.repository.mutate(async (accounts) => {
        let existing: Account | undefined;
        for (const account of accounts) {
          if (account.provider !== "gmail") {
            continue;
          }
          if (account.identityKey === identityKey) {
            existing = account;
            break;
          }
          const stored = await this.credentials.get(account.id);
          if (stored && parseGmailCredential(stored).subject === result.subject) {
            existing = account;
            break;
          }
        }

        const account: Account = {
          id: existing?.id ?? createAccountId(),
          provider: "gmail",
          address: result.email,
          ...(result.displayName ? { displayName: result.displayName } : {}),
          status: "connected",
          identityKey,
        };
        writtenAccountId = account.id;
        previousCredential = await this.credentials.get(account.id);
        const previous = previousCredential ? parseGmailCredential(previousCredential) : undefined;
        const refreshToken = result.refreshToken ?? previous?.refreshToken;
        if (!refreshToken) {
          throw new TmailError(
            "AUTHENTICATION_REQUIRED",
            "Google did not issue a refresh token. Revoke the prior grant and try again.",
          );
        }
        await this.credentials.set(
          account.id,
          serializeGmailCredential({
            schemaVersion: 1,
            provider: "gmail",
            subject: result.subject,
            email: result.email,
            ...(result.displayName ? { displayName: result.displayName } : {}),
            accessToken: result.accessToken,
            refreshToken,
            ...(result.expiryDate ? { expiryDate: result.expiryDate } : {}),
            ...(result.scope ? { scope: result.scope } : {}),
          }),
        );
        return {
          accounts: [...accounts.filter((candidate) => candidate.id !== account.id), account],
          result: account,
        };
      });
    } catch (error) {
      if (writtenAccountId) {
        if (previousCredential) {
          await this.credentials.set(writtenAccountId, previousCredential).catch(() => undefined);
        } else {
          await this.credentials.delete(writtenAccountId).catch(() => undefined);
        }
      }
      throw error;
    }
  }

  public async remove(accountId: string): Promise<Account> {
    return this.repository.mutate(async (accounts) => {
      const account = accounts.find((candidate) => candidate.id === accountId);
      if (!account) {
        throw new TmailError("ACCOUNT_NOT_FOUND", `Account '${accountId}' was not found.`);
      }
      if (account.provider === "demo") {
        throw new TmailError("INVALID_ARGUMENT", "The Demo account cannot be removed.");
      }
      await this.credentials.delete(account.id);
      return {
        accounts: accounts.filter((candidate) => candidate.id !== account.id),
        result: account,
      };
    });
  }

  public async markAuthenticationRequired(accountId: string): Promise<void> {
    await this.repository.mutate(async (accounts) => ({
      accounts: accounts.map((account) =>
        account.id === accountId
          ? { ...account, status: "needs-authentication" as const }
          : account,
      ),
      result: undefined,
    }));
  }
}
