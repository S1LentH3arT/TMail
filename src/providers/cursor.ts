import { createHash } from "node:crypto";
import { z } from "zod";
import { TmailError } from "../domain/errors.js";

const cursorSchema = z.object({
  v: z.literal(1),
  provider: z.enum(["gmail", "outlook", "proton", "demo"]),
  accountId: z.string(),
  operation: z.enum(["list", "search"]),
  queryHash: z.string().optional(),
  token: z.string().min(1),
});

interface CursorContext {
  readonly provider: "gmail" | "outlook" | "proton" | "demo";
  readonly accountId: string;
  readonly operation: "list" | "search";
  readonly query?: string;
}

function hashQuery(query?: string): string | undefined {
  return query === undefined
    ? undefined
    : createHash("sha256").update(query).digest("base64url").slice(0, 22);
}

export function encodeCursor(context: CursorContext, token: string): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      provider: context.provider,
      accountId: context.accountId,
      operation: context.operation,
      ...(context.query !== undefined ? { queryHash: hashQuery(context.query) } : {}),
      token,
    }),
  ).toString("base64url");
}

export function decodeCursor(context: CursorContext, cursor?: string): string | undefined {
  if (!cursor) {
    return undefined;
  }
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
    if (
      parsed.provider !== context.provider ||
      parsed.accountId !== context.accountId ||
      parsed.operation !== context.operation ||
      parsed.queryHash !== hashQuery(context.query)
    ) {
      throw new Error("Cursor context mismatch");
    }
    return parsed.token;
  } catch (error) {
    throw new TmailError("INVALID_ARGUMENT", "The cursor is invalid for this request.", false, {
      cause: error,
    });
  }
}
