import { describe, expect, it } from "vitest";
import { RuntimeAccountRepository } from "../src/accounts/account-repository.js";
import { MailService } from "../src/application/mail-service.js";
import { runCommand, type CliIo } from "../src/cli/program.js";
import { DemoProvider } from "../src/providers/demo/demo-provider.js";

function harness() {
  const output: string[] = [];
  const io: CliIo = {
    stdout: (value) => output.push(value),
    stderr: () => {},
    isTTY: false,
  };
  const accounts = new RuntimeAccountRepository(true);
  const runtime = { accounts, mail: new MailService(accounts, [new DemoProvider()]) };
  return { output, io, runtime };
}

describe("machine-readable CLI", () => {
  it("prints version once and treats Commander's control-flow exit as success", async () => {
    const { output, io, runtime } = harness();
    const code = await runCommand(["--version"], runtime, io);

    expect(code).toBe(0);
    expect(output).toEqual(["0.1.0-alpha.1\n"]);
  });

  it("emits exactly one success envelope for data commands", async () => {
    const { output, io, runtime } = harness();
    const code = await runCommand(
      ["messages", "list", "--account", "acc_AAAAAAAAAAAAAAAAAAAAAA"],
      runtime,
      io,
    );

    expect(code).toBe(0);
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      schemaVersion: "1",
      ok: true,
      data: { messages: expect.any(Array) },
      meta: { requestId: expect.any(String) },
    });
  });

  it("normalizes command failures into a stable error envelope", async () => {
    const { output, io, runtime } = harness();
    const code = await runCommand(["messages", "list"], runtime, io);

    expect(code).toBe(1);
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      schemaVersion: "1",
      ok: false,
      error: { code: "INVALID_ARGUMENT", retryable: false },
    });
  });
});
