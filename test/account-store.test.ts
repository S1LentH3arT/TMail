import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FileAccountRepository,
  MemoryAccountRepository,
} from "../src/accounts/account-repository.js";
import { AccountService } from "../src/accounts/account-service.js";
import { InMemoryCredentialStore } from "../src/credentials/credential-store.js";
import type { TmailError } from "../src/domain/errors.js";

const gmailAuthorization = {
  subject: "google-subject-1",
  email: "reader@example.com",
  displayName: "Inbox Reader",
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiryDate: 1_800_000_000_000,
  scope: "openid email https://www.googleapis.com/auth/gmail.readonly",
};

describe("persistent account lifecycle", () => {
  it("atomically persists versioned metadata without provider identities", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tmail-accounts-"));
    const path = join(directory, "accounts.json");
    const repository = new FileAccountRepository(path);
    const accounts = new AccountService(repository, new InMemoryCredentialStore());

    const connected = await accounts.connectGmail(gmailAuthorization);
    const stored = JSON.parse(await readFile(path, "utf8"));

    expect(stored).toMatchObject({
      schemaVersion: 1,
      accounts: [{ id: connected.id, provider: "gmail", address: "reader@example.com" }],
    });
    expect(JSON.stringify(stored)).not.toContain("google-subject-1");
    expect(JSON.stringify(stored)).not.toContain("access-token");
  });

  it("reuses the stable TMail account ID when the same Google identity reconnects", async () => {
    const credentials = new InMemoryCredentialStore();
    const accounts = new AccountService(new MemoryAccountRepository(), credentials);

    const first = await accounts.connectGmail(gmailAuthorization);
    const second = await accounts.connectGmail({
      ...gmailAuthorization,
      email: "renamed@example.com",
      accessToken: "new-access-token",
    });

    expect(second.id).toBe(first.id);
    expect(second.address).toBe("renamed@example.com");
    expect(await accounts.list()).toHaveLength(1);
  });

  it("preserves an invalid account file instead of silently replacing it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tmail-invalid-"));
    const path = join(directory, "accounts.json");
    await writeFile(path, "not json\n", "utf8");
    const repository = new FileAccountRepository(path);

    await expect(repository.list()).rejects.toMatchObject<TmailError>({
      code: "ACCOUNT_STORE_INVALID",
    });
    expect(await readFile(path, "utf8")).toBe("not json\n");
  });
});
