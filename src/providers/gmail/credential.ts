import { z } from "zod";
import { TmailError } from "../../domain/errors.js";

const gmailCredentialSchema = z.object({
  schemaVersion: z.literal(1),
  provider: z.literal("gmail"),
  subject: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1).optional(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiryDate: z.number().int().positive().optional(),
  scope: z.string().optional(),
});

export type GmailCredential = z.infer<typeof gmailCredentialSchema>;

export function serializeGmailCredential(credential: GmailCredential): string {
  return JSON.stringify(gmailCredentialSchema.parse(credential));
}

export function parseGmailCredential(value: string | null): GmailCredential {
  if (!value) {
    throw new TmailError(
      "AUTHENTICATION_REQUIRED",
      "This Gmail account must be authenticated again.",
    );
  }
  try {
    return gmailCredentialSchema.parse(JSON.parse(value));
  } catch (error) {
    throw new TmailError(
      "AUTHENTICATION_REQUIRED",
      "This Gmail account must be authenticated again.",
      false,
      { cause: error },
    );
  }
}
