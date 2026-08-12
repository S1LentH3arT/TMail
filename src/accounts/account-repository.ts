import { randomBytes } from "node:crypto";
import { open, mkdir, readFile, rename, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { Account } from "../domain/account.js";
import { TmailError } from "../domain/errors.js";

export interface AccountRepository {
  list(): Promise<readonly Account[]>;
  get(accountId: string): Promise<Account>;
}

export interface AccountMutation<T> {
  readonly accounts: readonly Account[];
  readonly result: T;
}

export interface MutableAccountRepository extends AccountRepository {
  mutate<T>(operation: (accounts: readonly Account[]) => Promise<AccountMutation<T>>): Promise<T>;
}

const accountSchema = z.object({
  id: z.string().regex(/^acc_[A-Za-z0-9_-]{22}$/u),
  address: z.string().email(),
  displayName: z.string().min(1).optional(),
  provider: z.enum(["gmail", "outlook", "proton"]),
  status: z.enum(["connected", "needs-authentication", "unavailable"]),
  identityKey: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/u)
    .optional(),
});

const accountFileSchema = z.object({
  schemaVersion: z.literal(1),
  accounts: z.array(accountSchema),
});

const LOCK_WAIT_MS = 5_000;
const STALE_LOCK_MS = 30_000;

function defaultConfigDirectory(): string {
  if (process.env.TMAIL_CONFIG_DIR) {
    return process.env.TMAIL_CONFIG_DIR;
  }
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "TMail");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "TMail");
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "tmail");
}

export function defaultAccountFile(): string {
  return join(defaultConfigDirectory(), "accounts.json");
}

function invalidStore(cause?: unknown): TmailError {
  return new TmailError(
    "ACCOUNT_STORE_INVALID",
    "The account store is invalid or was created by an incompatible TMail version.",
    false,
    cause ? { cause } : undefined,
  );
}

export class FileAccountRepository implements MutableAccountRepository {
  readonly #path: string;
  readonly #lockPath: string;

  public constructor(path = defaultAccountFile()) {
    this.#path = path;
    this.#lockPath = `${path}.lock`;
  }

  public async list(): Promise<readonly Account[]> {
    try {
      const contents = await readFile(this.#path, "utf8");
      const parsed = accountFileSchema.safeParse(JSON.parse(contents));
      if (!parsed.success) {
        throw invalidStore(parsed.error);
      }
      return parsed.data.accounts.map((account) => ({
        id: account.id,
        address: account.address,
        provider: account.provider,
        status: account.status,
        ...(account.displayName ? { displayName: account.displayName } : {}),
        ...(account.identityKey ? { identityKey: account.identityKey } : {}),
      }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      if (error instanceof TmailError) {
        throw error;
      }
      throw invalidStore(error);
    }
  }

  public async get(accountId: string): Promise<Account> {
    const account = (await this.list()).find((candidate) => candidate.id === accountId);
    if (!account) {
      throw new TmailError("ACCOUNT_NOT_FOUND", `Account '${accountId}' was not found.`);
    }
    return account;
  }

  public async mutate<T>(
    operation: (accounts: readonly Account[]) => Promise<AccountMutation<T>>,
  ): Promise<T> {
    const release = await this.#acquireLock();
    try {
      const current = await this.list();
      const mutation = await operation(current);
      const parsed = accountFileSchema.safeParse({
        schemaVersion: 1,
        accounts: mutation.accounts,
      });
      if (!parsed.success) {
        throw invalidStore(parsed.error);
      }
      await this.#write(parsed.data);
      return mutation.result;
    } finally {
      await release();
    }
  }

  async #write(value: z.infer<typeof accountFileSchema>): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, this.#path);
  }

  async #acquireLock(): Promise<() => Promise<void>> {
    await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
    const startedAt = Date.now();
    while (Date.now() - startedAt < LOCK_WAIT_MS) {
      try {
        const handle = await open(this.#lockPath, "wx", 0o600);
        await handle.writeFile(`${process.pid}\n`, "utf8");
        return async () => {
          await handle.close();
          await unlink(this.#lockPath).catch(() => undefined);
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error;
        }
        const details = await stat(this.#lockPath).catch(() => undefined);
        if (details && Date.now() - details.mtimeMs > STALE_LOCK_MS) {
          await unlink(this.#lockPath).catch(() => undefined);
          continue;
        }
        await delay(50);
      }
    }
    throw new TmailError("ACCOUNT_STORE_BUSY", "The account store is busy.", true);
  }
}

const DEMO_ACCOUNT: Account = {
  id: "acc_AAAAAAAAAAAAAAAAAAAAAA",
  address: "demo@tmail.local",
  displayName: "TMail Demo",
  provider: "demo",
  status: "connected",
};

export class MemoryAccountRepository implements MutableAccountRepository {
  #accounts: Account[];

  public constructor(accounts: readonly Account[] = []) {
    this.#accounts = [...accounts];
  }

  public async list(): Promise<readonly Account[]> {
    return [...this.#accounts];
  }

  public async get(accountId: string): Promise<Account> {
    const account = this.#accounts.find((candidate) => candidate.id === accountId);
    if (!account) {
      throw new TmailError("ACCOUNT_NOT_FOUND", `Account '${accountId}' was not found.`);
    }
    return account;
  }

  public async mutate<T>(
    operation: (accounts: readonly Account[]) => Promise<AccountMutation<T>>,
  ): Promise<T> {
    const mutation = await operation([...this.#accounts]);
    this.#accounts = [...mutation.accounts];
    return mutation.result;
  }
}

export class RuntimeAccountRepository implements MutableAccountRepository {
  readonly #persistent: MutableAccountRepository;

  public constructor(
    private readonly demoEnabled = process.env.TMAIL_ENABLE_DEMO === "1",
    persistent?: MutableAccountRepository,
  ) {
    this.#persistent =
      persistent ?? (demoEnabled ? new MemoryAccountRepository() : new FileAccountRepository());
  }

  public async list(): Promise<readonly Account[]> {
    const accounts = await this.#persistent.list();
    return this.demoEnabled ? [DEMO_ACCOUNT, ...accounts] : accounts;
  }

  public async get(accountId: string): Promise<Account> {
    const account = (await this.list()).find((candidate) => candidate.id === accountId);
    if (!account) {
      throw new TmailError("ACCOUNT_NOT_FOUND", `Account '${accountId}' was not found.`);
    }
    return account;
  }

  public async mutate<T>(
    operation: (accounts: readonly Account[]) => Promise<AccountMutation<T>>,
  ): Promise<T> {
    return this.#persistent.mutate(operation);
  }
}
