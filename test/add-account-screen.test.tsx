import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";
import { TmailError } from "../src/domain/errors.js";
import type { TmailRuntime } from "../src/runtime.js";
import { AddAccountScreen } from "../src/tui/add-account-screen.js";

describe("AddAccountScreen", () => {
  it("does not leave the starting status visible after Gmail authorization fails", async () => {
    const authorize = vi.fn(async () => {
      throw new TmailError("PROVIDER_NOT_CONFIGURED", "Gmail OAuth is not configured.");
    });
    const runtime = {
      gmail: { configured: true, authorize },
      accounts: { connectGmail: vi.fn() },
    } as unknown as TmailRuntime;
    const view = render(
      <AddAccountScreen runtime={runtime} onBack={vi.fn()} onConnected={vi.fn()} />,
    );

    view.stdin.write("\r");

    await vi.waitFor(() => expect(view.lastFrame()).toContain("Gmail OAuth is not configured."));
    expect(view.lastFrame()).not.toContain("Starting Gmail authorization");
    view.unmount();
  });

  it("does not start authorization when Gmail has no configured OAuth client", async () => {
    const authorize = vi.fn();
    const runtime = {
      gmail: { configured: false, authorize },
      accounts: { connectGmail: vi.fn() },
    } as unknown as TmailRuntime;
    const view = render(
      <AddAccountScreen runtime={runtime} onBack={vi.fn()} onConnected={vi.fn()} />,
    );

    view.stdin.write("\r");

    await vi.waitFor(() => expect(view.lastFrame()).toContain("Gmail OAuth is not configured."));
    expect(view.lastFrame()).not.toContain("Starting Gmail authorization");
    expect(authorize).not.toHaveBeenCalled();
    view.unmount();
  });
});
