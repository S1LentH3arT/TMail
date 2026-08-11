# TMail

TMail is an agent-friendly terminal email client. It combines an interactive Ink interface for
people with a versioned JSON command interface for external agents and scripts.

> [!IMPORTANT]
> This repository is at `0.1.0-alpha.1`. The current milestone is a working vertical slice backed
> by synthetic DemoProvider data. Gmail, Outlook, and Proton Mail are represented by explicit
> capability descriptors but are not connected yet.

## Product boundary

- Read-only Inbox access: list, search, and read messages without changing remote state.
- One row represents one provider message, not an aggregated conversation.
- Multiple explicit accounts; no unified Inbox in the first Alpha.
- No embedded language model. Agents use stable CLI commands and JSON envelopes.
- No persistent message database or background synchronization in the first Alpha.
- Credentials belong in the operating-system credential store. There is no plaintext fallback.

## Requirements

- Node.js 22.12 or newer
- A terminal of at least 50×14; 80×24 is recommended
- macOS, Linux desktop, or Windows Terminal

## Development

```sh
npm install
npm run build
npm run demo
```

`npm run demo` enables a deterministic account containing synthetic messages. It exercises the
account homepage, Inbox list, search, HTML/plain-text reader, link confirmation, responsive layout,
and Unicode rendering without requiring real credentials.

Quality gates:

```sh
npm run check
npm run build
npm run test:pty   # Linux PTY smoke test
```

## Commands

Running `tmail` without arguments opens the TUI. Data commands emit one JSON document to stdout:

```text
tmail accounts list
tmail accounts add [--provider gmail|outlook|proton]
tmail accounts remove --account <account-id> [--yes]
tmail messages list --account <id> [--limit 30] [--cursor <cursor>]
tmail messages read --account <id> --message <provider-message-id>
tmail messages search --account <id> --query <text> [--limit 30] [--cursor <cursor>]
tmail doctor [--account <id>]
tmail completion <bash|zsh|fish>
tmail --help
tmail --version
```

The stable envelope starts with `schemaVersion: "1"` and `ok: true|false`. Programs must branch on
the error `code`, not the human-readable English message. Add `--pretty` for development output.

Demo CLI example:

```sh
TMAIL_ENABLE_DEMO=1 node dist/cli.js accounts list --pretty
TMAIL_ENABLE_DEMO=1 node dist/cli.js messages list \
  --account acc_AAAAAAAAAAAAAAAAAAAAAA --pretty
```

## Architecture

```text
CLI / Ink TUI
     │
application/MailService
     │
domain contracts ── AccountRepository ── CredentialStore
     │
provider adapters (Demo → Gmail → Outlook → Proton Bridge)
```

Provider SDK types do not cross the provider boundary. The application layer operates on TMail
accounts, message summaries, messages, capabilities, and opaque cursors. The body pipeline treats
plain text as text and converts sanitized HTML through an mdast tree used by both terminal rendering
and JSON Markdown output.

## Planned provider order

1. Gmail: Google OAuth desktop flow and Gmail REST, delegated read-only scopes.
2. Outlook: Microsoft device code and Graph REST, delegated `Mail.Read`.
3. Proton Mail preview: local Proton Bridge IMAP with loopback enforcement and pinned TLS
   certificate trust.

The project will not claim a provider is available until its authentication, provider contract,
failure handling, and release-platform tests pass.

## License

MIT. Demo fixtures are synthetic and contain no user mailbox data.
