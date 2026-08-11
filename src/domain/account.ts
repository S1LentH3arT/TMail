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
}

export interface PublicAccount extends Omit<Account, "provider"> {
  readonly provider: Exclude<AccountProvider, "demo"> | "demo";
}
