import { OAuth2Client } from "google-auth-library";
import type { CredentialStore } from "../../credentials/credential-store.js";
import { TmailError } from "../../domain/errors.js";
import { gmailClientId } from "./authenticator.js";
import { parseGmailCredential, serializeGmailCredential } from "./credential.js";

export class GmailTokenProvider {
  public constructor(
    private readonly credentials: CredentialStore,
    private readonly clientId = gmailClientId(),
    private readonly onAuthenticationRequired?: (accountId: string) => Promise<void>,
  ) {}

  public async get(accountId: string, forceRefresh = false): Promise<string> {
    if (!this.clientId) {
      throw new TmailError("PROVIDER_NOT_CONFIGURED", "Gmail OAuth is not configured.");
    }
    const stored = parseGmailCredential(await this.credentials.get(accountId));
    const client = new OAuth2Client({ clientId: this.clientId });
    client.setCredentials({
      ...(!forceRefresh ? { access_token: stored.accessToken } : {}),
      refresh_token: stored.refreshToken,
      ...(forceRefresh
        ? { expiry_date: 0 }
        : stored.expiryDate
          ? { expiry_date: stored.expiryDate }
          : {}),
      ...(stored.scope ? { scope: stored.scope } : {}),
    });
    try {
      const response = await client.getAccessToken();
      if (!response.token) {
        throw new TmailError(
          "AUTHENTICATION_REQUIRED",
          "This Gmail account must be authenticated again.",
        );
      }
      const updated = {
        ...stored,
        accessToken: response.token,
        ...(client.credentials.expiry_date ? { expiryDate: client.credentials.expiry_date } : {}),
        ...(client.credentials.scope ? { scope: client.credentials.scope } : {}),
      };
      if (serializeGmailCredential(updated) !== serializeGmailCredential(stored)) {
        await this.credentials.set(accountId, serializeGmailCredential(updated));
      }
      return response.token;
    } catch (error) {
      if (error instanceof TmailError) {
        throw error;
      }
      const details = error as {
        readonly response?: {
          readonly status?: number;
          readonly data?: { readonly error?: string };
        };
      };
      if (details.response?.data?.error === "invalid_grant" || details.response?.status === 400) {
        await this.invalidate(accountId);
        throw new TmailError(
          "AUTHENTICATION_REQUIRED",
          "This Gmail account must be authenticated again.",
          false,
          { cause: error },
        );
      }
      throw new TmailError(
        "NETWORK_UNAVAILABLE",
        "Google authentication could not be reached.",
        true,
        {
          cause: error,
        },
      );
    }
  }

  public async invalidate(accountId: string): Promise<void> {
    await this.onAuthenticationRequired?.(accountId);
  }
}
