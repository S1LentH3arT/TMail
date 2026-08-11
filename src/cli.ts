#!/usr/bin/env node
import process from "node:process";
import { createRuntime } from "./runtime.js";

const args = process.argv.slice(2);
const runtime = createRuntime();

if (args.length === 0) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write(
      "TMail requires an interactive terminal. Use a subcommand for JSON output.\n",
    );
    process.exitCode = 1;
  } else {
    const [{ render }, { default: React }, { App }] = await Promise.all([
      import("ink"),
      import("react"),
      import("./tui/app.js"),
    ]);
    const instance = render(React.createElement(App, { runtime }));
    await instance.waitUntilExit();
  }
} else {
  const { runCommand } = await import("./cli/program.js");
  process.exitCode = await runCommand(args, runtime);
}
