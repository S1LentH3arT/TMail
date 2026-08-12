import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { TmailError } from "../../domain/errors.js";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const IDENTITY_SCOPES = ["openid", "email"] as const;

export interface GmailAuthorizationInteraction {
  readonly showAuthorization: (url: string) => void;
}

export interface GmailAuthorizationResult {
  readonly subject: string;
  readonly email: string;
  readonly displayName?: string;
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiryDate?: number;
  readonly scope?: string;
}

export function gmailClientId(): string | undefined {
  return process.env.TMAIL_GOOGLE_CLIENT_ID?.trim() || undefined;
}

function sameState(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return (
    expectedBytes.byteLength === actualBytes.byteLength &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

interface CallbackResult {
  readonly code: string;
}

async function listenForCallback(
  state: string,
  signal?: AbortSignal,
): Promise<{
  readonly redirectUri: string;
  readonly result: Promise<CallbackResult>;
  readonly close: () => Promise<void>;
}> {
  let resolveResult: (value: CallbackResult) => void = () => undefined;
  let rejectResult: (reason: unknown) => void = () => undefined;
  let settled = false;
  const result = new Promise<CallbackResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const finish = (callback: () => void) => {
    if (!settled) {
      settled = true;
      callback();
    }
  };
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/oauth/callback") {
      response.writeHead(404).end("Not found");
      return;
    }
    const returnedState = url.searchParams.get("state") ?? "";
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    if (!sameState(state, returnedState)) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("The authorization response could not be verified. Return to TMail.");
      finish(() =>
        rejectResult(new TmailError("AUTHORIZATION_DENIED", "The OAuth state was invalid.")),
      );
      return;
    }
    if (error || !code) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("Authorization was not completed. Return to TMail.");
      finish(() =>
        rejectResult(new TmailError("AUTHORIZATION_DENIED", "Gmail authorization was denied.")),
      );
      return;
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    });
    response.end(
      "<!doctype html><meta charset=utf-8><title>TMail</title><p>Gmail connected. You may close this window and return to TMail.</p>",
    );
    finish(() => resolveResult({ code }));
  });
  server.on("error", (error) => finish(() => rejectResult(error)));
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  const onAbort = () =>
    finish(() => rejectResult(new TmailError("CANCELLED", "Authorization was cancelled.")));
  signal?.addEventListener("abort", onAbort, { once: true });
  return {
    redirectUri: `http://127.0.0.1:${address.port}/oauth/callback`,
    result,
    close: async () => {
      signal?.removeEventListener("abort", onAbort);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export class GmailAuthenticator {
  public constructor(private readonly clientId = gmailClientId()) {}

  public get configured(): boolean {
    return Boolean(this.clientId);
  }

  public async authorize(
    interaction: GmailAuthorizationInteraction,
    signal?: AbortSignal,
  ): Promise<GmailAuthorizationResult> {
    if (!this.clientId) {
      throw new TmailError(
        "PROVIDER_NOT_CONFIGURED",
        "Gmail requires an approved OAuth client ID. Set TMAIL_GOOGLE_CLIENT_ID for preview use.",
      );
    }
    signal?.throwIfAborted();
    const state = randomBytes(32).toString("base64url");
    const callback = await listenForCallback(state, signal);
    try {
      const client = new OAuth2Client({
        clientId: this.clientId,
        redirectUri: callback.redirectUri,
      });
      const verifier = await client.generateCodeVerifierAsync();
      if (!verifier.codeChallenge) {
        throw new TmailError("UNEXPECTED_ERROR", "PKCE initialization failed.");
      }
      const authorizationUrl = client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: [...IDENTITY_SCOPES, GMAIL_READONLY_SCOPE],
        state,
        code_challenge: verifier.codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
      });
      const checkedUrl = new URL(authorizationUrl);
      if (checkedUrl.protocol !== "https:" || checkedUrl.hostname !== "accounts.google.com") {
        throw new TmailError(
          "PROVIDER_RESPONSE_INVALID",
          "Google returned an unsafe authorization URL.",
        );
      }
      interaction.showAuthorization(checkedUrl.toString());
      const { code } = await callback.result;
      signal?.throwIfAborted();
      const { tokens } = await client.getToken({
        code,
        codeVerifier: verifier.codeVerifier,
        redirect_uri: callback.redirectUri,
      });
      client.setCredentials(tokens);
      if (!tokens.access_token) {
        throw new TmailError("PROVIDER_RESPONSE_INVALID", "Google did not return an access token.");
      }
      const tokenInfo = await client.getTokenInfo(tokens.access_token);
      if (!tokenInfo.sub || !tokenInfo.email || tokenInfo.email_verified === false) {
        throw new TmailError(
          "PROVIDER_RESPONSE_INVALID",
          "Google did not return a verified account identity.",
        );
      }
      return {
        subject: tokenInfo.sub,
        email: tokenInfo.email,
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        ...(tokens.expiry_date ? { expiryDate: tokens.expiry_date } : {}),
        ...(tokens.scope ? { scope: tokens.scope } : {}),
      };
    } catch (error) {
      if (error instanceof TmailError) {
        throw error;
      }
      if (signal?.aborted) {
        throw new TmailError("CANCELLED", "Authorization was cancelled.", false, { cause: error });
      }
      throw new TmailError(
        "AUTHORIZATION_DENIED",
        "Gmail authorization could not be completed.",
        false,
        { cause: error },
      );
    } finally {
      await callback.close();
    }
  }
}
