import { randomBytes } from "node:crypto";

export const ACCOUNT_ID_PATTERN = /^acc_[A-Za-z0-9_-]{22}$/;

export function createAccountId(): string {
  return `acc_${randomBytes(16).toString("base64url")}`;
}

export type AccountProvider = "demo" | "gmail" | "outlook" | "proton";
export type AccountStatus = "connected" | "needs-authentication" | "unavailable";

export interface Account {
  readonly id: string;
  readonly address: string;
  readonly displayName?: string;
  readonly provider: AccountProvider;
  readonly status: AccountStatus;
  /** Internal deduplication key. Never include this field in public envelopes or logs. */
  readonly identityKey?: string;
}

export type PublicAccount = Omit<Account, "identityKey">;

export function toPublicAccount(account: Account): PublicAccount {
  const { identityKey: _identityKey, ...publicAccount } = account;
  return publicAccount;
}
