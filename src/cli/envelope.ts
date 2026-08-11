import { randomUUID } from "node:crypto";
import type { TmailError } from "../domain/errors.js";

export interface EnvelopeMeta {
  readonly requestId: string;
  readonly nextCursor?: string;
}

export interface SuccessEnvelope<T> {
  readonly schemaVersion: "1";
  readonly ok: true;
  readonly data: T;
  readonly meta: EnvelopeMeta;
}

export interface ErrorEnvelope {
  readonly schemaVersion: "1";
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly meta: { readonly requestId: string };
}

export function success<T>(data: T, nextCursor?: string): SuccessEnvelope<T> {
  return {
    schemaVersion: "1",
    ok: true,
    data,
    meta: { requestId: randomUUID(), ...(nextCursor ? { nextCursor } : {}) },
  };
}

export function failure(error: TmailError): ErrorEnvelope {
  return {
    schemaVersion: "1",
    ok: false,
    error: { code: error.code, message: error.message, retryable: error.retryable },
    meta: { requestId: randomUUID() },
  };
}

export function serializeEnvelope(
  value: SuccessEnvelope<unknown> | ErrorEnvelope,
  pretty = false,
): string {
  return `${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`;
}
