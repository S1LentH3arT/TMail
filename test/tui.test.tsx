import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";
import { RuntimeAccountRepository } from "../src/accounts/account-repository.js";
import { MailService } from "../src/application/mail-service.js";
import { DemoProvider } from "../src/providers/demo/demo-provider.js";
import { App } from "../src/tui/app.js";

describe("TUI vertical slice", () => {
  it("moves from account selection to the Demo Inbox", async () => {
    const accounts = new RuntimeAccountRepository(true);
    const runtime = { accounts, mail: new MailService(accounts, [new DemoProvider()]) };
    const view = render(<App runtime={runtime} />);

    await vi.waitFor(() => expect(view.lastFrame()).toContain("demo@tmail.local"));
    view.stdin.write("\r");
    await vi.waitFor(() => expect(view.lastFrame()).toContain("Welcome to TMail"));

    view.stdin.write("/");
    await vi.waitFor(() => expect(view.lastFrame()).toContain("Search Inbox:"));
    view.stdin.write("Build");
    await vi.waitFor(() => expect(view.lastFrame()).toContain("Search Inbox: Build"));
    await vi.waitFor(() => expect(view.lastFrame()).not.toContain("Welcome to TMail"));
    view.stdin.write("\r");
    await vi.waitFor(() => expect(view.lastFrame()).toContain("Results for “Build”"));
    expect(view.lastFrame()).not.toContain("Welcome to TMail");

    view.unmount();
  });
});
