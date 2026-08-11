import { TmailError } from "../domain/errors.js";

export const CREDENTIAL_SERVICE = "dev.tmail.cli";

export interface CredentialStore {
  get(accountId: string): Promise<string | null>;
  set(accountId: string, versionedCredential: string): Promise<void>;
  delete(accountId: string): Promise<boolean>;
}

export class InMemoryCredentialStore implements CredentialStore {
  readonly #credentials = new Map<string, string>();

  public async get(accountId: string): Promise<string | null> {
    return this.#credentials.get(accountId) ?? null;
  }

  public async set(accountId: string, versionedCredential: string): Promise<void> {
    this.#credentials.set(accountId, versionedCredential);
  }

  public async delete(accountId: string): Promise<boolean> {
    return this.#credentials.delete(accountId);
  }
}

interface KeyringEntry {
  getPassword(): Promise<string | null>;
  setPassword(password: string): Promise<void>;
  deletePassword(): Promise<boolean>;
}

type KeyringModule = {
  Entry: new (service: string, account: string) => KeyringEntry;
};

export class SystemCredentialStore implements CredentialStore {
  async #entry(accountId: string): Promise<KeyringEntry> {
    try {
      const keyring = (await import("@napi-rs/keyring")) as unknown as KeyringModule;
      return new keyring.Entry(CREDENTIAL_SERVICE, accountId);
    } catch (error) {
      throw new TmailError(
        "CREDENTIAL_STORE_UNAVAILABLE",
        "The system credential store is unavailable.",
        false,
        { cause: error },
      );
    }
  }

  public async get(accountId: string): Promise<string | null> {
    try {
      return await (await this.#entry(accountId)).getPassword();
    } catch (error) {
      throw this.#unavailable(error);
    }
  }

  public async set(accountId: string, versionedCredential: string): Promise<void> {
    try {
      await (await this.#entry(accountId)).setPassword(versionedCredential);
    } catch (error) {
      throw this.#unavailable(error);
    }
  }

  public async delete(accountId: string): Promise<boolean> {
    try {
      return await (await this.#entry(accountId)).deletePassword();
    } catch (error) {
      throw this.#unavailable(error);
    }
  }

  #unavailable(error: unknown): TmailError {
    return error instanceof TmailError
      ? error
      : new TmailError(
          "CREDENTIAL_STORE_UNAVAILABLE",
          "The system credential store is unavailable.",
          false,
          { cause: error },
        );
  }
}
