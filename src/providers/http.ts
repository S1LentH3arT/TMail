import { setTimeout as delay } from "node:timers/promises";
import { TmailError } from "../domain/errors.js";

interface AuthorizedJsonRequest {
  readonly url: URL;
  readonly signal?: AbortSignal;
  readonly getAccessToken: (forceRefresh: boolean) => Promise<string>;
  readonly invalidArgumentCode?: "QUERY_INVALID";
  readonly notFoundCode?: "MESSAGE_NOT_FOUND";
  readonly onAuthenticationRequired?: () => Promise<void>;
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) {
    return undefined;
  }
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds;
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1_000));
}

function aborted(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === "AbortError");
}

export async function authorizedJson<T>(request: AuthorizedJsonRequest): Promise<T> {
  let forceRefresh = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    request.signal?.throwIfAborted();
    try {
      const accessToken = await request.getAccessToken(forceRefresh);
      const response = await fetch(request.url, {
        headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
        ...(request.signal ? { signal: request.signal } : {}),
      });
      if (response.ok) {
        return (await response.json()) as T;
      }
      if (response.status === 401 && !forceRefresh) {
        forceRefresh = true;
        continue;
      }
      if (response.status === 401) {
        await request.onAuthenticationRequired?.();
        throw new TmailError("AUTHENTICATION_REQUIRED", "The account must be authenticated again.");
      }
      if (response.status === 403) {
        throw new TmailError(
          "AUTHORIZATION_DENIED",
          "The provider denied access to the requested mailbox data.",
        );
      }
      if (response.status === 404 && request.notFoundCode) {
        throw new TmailError(request.notFoundCode, "The message was not found.");
      }
      if (response.status === 400 && request.invalidArgumentCode) {
        throw new TmailError(
          request.invalidArgumentCode,
          "The provider rejected the search query.",
        );
      }
      const retryAfter = retryAfterSeconds(response);
      if (response.status === 429) {
        if (attempt < 3) {
          await delay(
            (retryAfter ?? 2 ** attempt) * 1_000 + Math.floor(Math.random() * 150),
            undefined,
            request.signal ? { signal: request.signal } : undefined,
          );
          continue;
        }
        throw new TmailError("RATE_LIMITED", "The provider rate limit was reached.", true, {
          ...(retryAfter !== undefined ? { retryAfterSeconds: retryAfter } : {}),
        });
      }
      if (response.status >= 500 && attempt < 3) {
        await delay(
          2 ** attempt * 250 + Math.floor(Math.random() * 150),
          undefined,
          request.signal ? { signal: request.signal } : undefined,
        );
        continue;
      }
      throw new TmailError(
        "PROVIDER_RESPONSE_INVALID",
        "The provider returned an unexpected response.",
        response.status >= 500,
      );
    } catch (error) {
      if (error instanceof TmailError) {
        throw error;
      }
      if (aborted(error, request.signal)) {
        throw new TmailError("CANCELLED", "The operation was cancelled.", false, { cause: error });
      }
      if (attempt < 3) {
        await delay(
          2 ** attempt * 250 + Math.floor(Math.random() * 150),
          undefined,
          request.signal ? { signal: request.signal } : undefined,
        );
        continue;
      }
      throw new TmailError("NETWORK_UNAVAILABLE", "The provider could not be reached.", true, {
        cause: error,
      });
    }
  }
  throw new TmailError("NETWORK_UNAVAILABLE", "The provider could not be reached.", true);
}
