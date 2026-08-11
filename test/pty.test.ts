import path from "node:path";
import process from "node:process";
import { spawn } from "node-pty";
import { describe, expect, it } from "vitest";

const runPty = process.env.TMAIL_PTY_TEST === "1" && process.platform === "linux";

describe.skipIf(!runPty)("packaged PTY", () => {
  it("renders the account homepage in a real terminal", async () => {
    const terminal = spawn(process.execPath, [path.resolve("dist/cli.js")], {
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: { ...process.env, CI: "true", TMAIL_ENABLE_DEMO: "1", NO_COLOR: "1" },
    });
    let output = "";
    terminal.onData((chunk) => {
      output += chunk;
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        terminal.kill();
        reject(new Error(`Timed out waiting for TUI output: ${output}`));
      }, 5_000);
      const poll = setInterval(() => {
        if (output.includes("Select an account") && output.includes("demo@tmail.local")) {
          clearInterval(poll);
          clearTimeout(timer);
          terminal.write("q");
          resolve();
        }
      }, 25);
    });

    expect(output).toContain("Select an account");
  }, 10_000);
});
