export type ErrorCode =
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_STORE_BUSY"
  | "ACCOUNT_STORE_INVALID"
  | "AUTHENTICATION_REQUIRED"
  | "AUTHORIZATION_DENIED"
  | "BRIDGE_CERTIFICATE_CHANGED"
  | "CANCELLED"
  | "CREDENTIAL_STORE_UNAVAILABLE"
  | "INTERACTIVE_AUTH_REQUIRED"
  | "INVALID_ARGUMENT"
  | "MESSAGE_NOT_FOUND"
  | "NETWORK_UNAVAILABLE"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_NOT_AVAILABLE"
  | "PROVIDER_RESPONSE_INVALID"
  | "QUERY_INVALID"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "UNEXPECTED_ERROR";

export class TmailError extends Error {
  public readonly retryAfterSeconds: number | undefined;

  public constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable = false,
    options?: ErrorOptions & { readonly retryAfterSeconds?: number },
  ) {
    super(message, options);
    this.name = "TmailError";
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}

export function toTmailError(error: unknown): TmailError {
  if (error instanceof TmailError) {
    return error;
  }

  return new TmailError("UNEXPECTED_ERROR", "An unexpected error occurred.", false, {
    cause: error,
  });
}
