export type ErrorCode =
  | "ACCOUNT_NOT_FOUND"
  | "BRIDGE_CERTIFICATE_CHANGED"
  | "CANCELLED"
  | "CREDENTIAL_STORE_UNAVAILABLE"
  | "INVALID_ARGUMENT"
  | "MESSAGE_NOT_FOUND"
  | "PROVIDER_NOT_AVAILABLE"
  | "TIMEOUT"
  | "UNEXPECTED_ERROR";

export class TmailError extends Error {
  public constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TmailError";
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
