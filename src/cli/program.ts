import process from "node:process";
import { Command, CommanderError, Option } from "commander";
import { normalizeBody } from "../body/normalize.js";
import { toPublicAccount } from "../domain/account.js";
import { TmailError, toTmailError } from "../domain/errors.js";
import { providerCatalog } from "../providers/catalog.js";
import type { TmailRuntime } from "../runtime.js";
import { openExternal } from "../tui/open-external.js";
import { completionScript, type SupportedShell } from "./completion.js";
import { failure, serializeEnvelope, success } from "./envelope.js";

export interface CliIo {
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
  readonly isTTY: boolean;
}

interface GlobalOptions {
  readonly pretty?: boolean;
  readonly debug?: boolean;
  readonly timeout?: string;
}

const defaultIo: CliIo = {
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
  isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
};

function positiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new TmailError("INVALID_ARGUMENT", "Expected a positive integer.");
  }
  return parsed;
}

async function withOperationTimeout<T>(
  program: Command,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const seconds = positiveInteger(program.opts<GlobalOptions>().timeout ?? "30");
  const signal = AbortSignal.timeout(seconds * 1_000);
  try {
    return await operation(signal);
  } catch (error) {
    if (signal.aborted) {
      throw new TmailError(
        "TIMEOUT",
        `The operation exceeded the ${seconds}-second timeout.`,
        true,
        {
          cause: error,
        },
      );
    }
    throw error;
  }
}

export function createProgram(runtime: TmailRuntime, io: CliIo = defaultIo): Command {
  const program = new Command();
  const write = (data: unknown, nextCursor?: string) => {
    const options = program.opts<GlobalOptions>();
    io.stdout(serializeEnvelope(success(data, nextCursor), Boolean(options.pretty)));
  };

  program
    .name("tmail")
    .description("An agent-friendly terminal email client.")
    .version("0.1.0-alpha.1")
    .option("--pretty", "pretty-print JSON output")
    .option("--debug", "write redacted diagnostic logs")
    .addOption(new Option("--timeout <seconds>", "bound the total operation timeout").default("30"))
    .showSuggestionAfterError()
    .exitOverride()
    .configureOutput({
      writeOut: io.stdout,
      writeErr: () => {},
    });

  const accounts = program.command("accounts").description("Manage local email accounts.");
  accounts
    .command("list")
    .description("List configured accounts.")
    .action(async () => write({ accounts: (await runtime.accounts.list()).map(toPublicAccount) }));

  accounts
    .command("add")
    .description("Connect an email account.")
    .addOption(new Option("--provider <provider>").choices(["gmail", "outlook", "proton"]))
    .action(async (options: { provider?: string }) => {
      if (!options.provider && !io.isTTY) {
        throw new TmailError(
          "INVALID_ARGUMENT",
          "--provider is required when standard input is not interactive.",
        );
      }
      const provider = options.provider ?? "provider selection";
      if (!io.isTTY) {
        throw new TmailError(
          "INTERACTIVE_AUTH_REQUIRED",
          "Account authorization requires an interactive terminal.",
        );
      }
      if (provider !== "gmail") {
        throw new TmailError(
          "PROVIDER_NOT_AVAILABLE",
          `${provider} is planned but is not available in this milestone.`,
        );
      }
      const controller = new AbortController();
      const cancel = () => controller.abort();
      process.once("SIGINT", cancel);
      try {
        const authorization = await runtime.gmail.authorize(
          {
            showAuthorization: (url) => {
              io.stderr(`Authorize Gmail in your browser:\n${url}\n`);
              openExternal(url);
            },
          },
          controller.signal,
        );
        const account = await runtime.accounts.connectGmail(authorization);
        write({ account: toPublicAccount(account) });
      } finally {
        process.removeListener("SIGINT", cancel);
      }
    });

  accounts
    .command("remove")
    .description("Remove a local account and its credentials.")
    .requiredOption("--account <account-id>")
    .option("--yes", "confirm removal without an interactive prompt")
    .action(async (options: { account: string; yes?: boolean }) => {
      await runtime.accounts.get(options.account);
      if (!options.yes && !io.isTTY) {
        throw new TmailError(
          "INVALID_ARGUMENT",
          "--yes is required when standard input is not interactive.",
        );
      }
      const removed = await runtime.accounts.remove(options.account);
      write({ removedAccountId: removed.id });
    });

  const messages = program.command("messages").description("Read messages from one account.");
  messages
    .command("list")
    .description("List Inbox messages.")
    .requiredOption("--account <account-id>")
    .option("--limit <count>", "maximum messages", "30")
    .option("--cursor <cursor>")
    .action(async (options: { account: string; limit: string; cursor?: string }) => {
      const page = await withOperationTimeout(program, (signal) =>
        runtime.mail.list(options.account, {
          limit: positiveInteger(options.limit),
          ...(options.cursor ? { cursor: options.cursor } : {}),
          signal,
        }),
      );
      write({ messages: page.messages }, page.nextCursor);
    });

  messages
    .command("read")
    .description("Read one message without changing remote state.")
    .requiredOption("--account <account-id>")
    .requiredOption("--message <provider-message-id>")
    .action(async (options: { account: string; message: string }) => {
      const message = await withOperationTimeout(program, (signal) =>
        runtime.mail.read(options.account, options.message, signal),
      );
      const normalized = message.body ? await normalizeBody(message.body) : undefined;
      write({
        message: {
          ...message,
          body: normalized
            ? {
                format: "markdown",
                content: normalized.markdown,
                truncated: normalized.truncated,
              }
            : null,
        },
      });
    });

  messages
    .command("search")
    .description("Search the Inbox using provider search semantics.")
    .requiredOption("--account <account-id>")
    .requiredOption("--query <text>")
    .option("--limit <count>", "maximum messages", "30")
    .option("--cursor <cursor>")
    .action(async (options: { account: string; query: string; limit: string; cursor?: string }) => {
      const page = await withOperationTimeout(program, (signal) =>
        runtime.mail.search(options.account, options.query, {
          limit: positiveInteger(options.limit),
          ...(options.cursor ? { cursor: options.cursor } : {}),
          signal,
        }),
      );
      write({ messages: page.messages }, page.nextCursor);
    });

  program
    .command("doctor")
    .description("Report safe local diagnostics.")
    .option("--account <account-id>")
    .action(async (options: { account?: string }) => {
      const account = options.account ? await runtime.accounts.get(options.account) : undefined;
      write({
        runtime: { node: process.version, platform: process.platform, architecture: process.arch },
        credentialStore: "system",
        account: account
          ? { id: account.id, provider: account.provider, status: account.status }
          : undefined,
        providers: providerCatalog(runtime.gmail.configured).map(
          ({ id, status, capabilities }) => ({
            id,
            status,
            capabilities,
          }),
        ),
        telemetry: false,
      });
    });

  program
    .command("completion")
    .description("Generate a shell completion script.")
    .argument("<shell>", "bash, zsh, or fish")
    .action((shell: string) => {
      if (!(["bash", "zsh", "fish"] as const).includes(shell as SupportedShell)) {
        throw new TmailError("INVALID_ARGUMENT", `Unsupported shell '${shell}'.`);
      }
      io.stdout(completionScript(shell as SupportedShell));
    });

  return program;
}

export async function runCommand(
  argv: readonly string[],
  runtime: TmailRuntime,
  io: CliIo = defaultIo,
): Promise<number> {
  const program = createProgram(runtime, io);
  try {
    await program.parseAsync([...argv], { from: "user" });
    return 0;
  } catch (cause) {
    if (cause instanceof CommanderError && cause.exitCode === 0) {
      return 0;
    }
    const error =
      cause instanceof CommanderError
        ? new TmailError("INVALID_ARGUMENT", cause.message.replace(/^error:\s*/u, ""))
        : toTmailError(cause);
    const pretty = Boolean(program.opts<GlobalOptions>().pretty);
    io.stdout(serializeEnvelope(failure(error), pretty));
    return 1;
  }
}
