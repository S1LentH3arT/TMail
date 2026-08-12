import { Box, Text } from "ink";
import { useState } from "react";
import type { Account } from "../domain/account.js";
import type { MessageSummary } from "../domain/message.js";
import type { TmailRuntime } from "../runtime.js";
import { HomeScreen } from "./home-screen.js";
import { AddAccountScreen } from "./add-account-screen.js";
import { MessageListScreen } from "./message-list-screen.js";
import { ReaderScreen } from "./reader-screen.js";
import { useTerminalSize } from "./use-terminal-size.js";

type Screen =
  | { readonly kind: "home" }
  | { readonly kind: "add-account" }
  | { readonly kind: "list"; readonly account: Account }
  | { readonly kind: "reader"; readonly account: Account; readonly message: MessageSummary };

export function App({ runtime }: { readonly runtime: TmailRuntime }) {
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const size = useTerminalSize();

  if (size.columns < 50 || size.rows < 14) {
    return (
      <Box flexDirection="column">
        <Text bold>Terminal too small</Text>
        <Text>
          Minimum: 50×14 · Current: {size.columns}×{size.rows}
        </Text>
      </Box>
    );
  }

  if (screen.kind === "home") {
    return (
      <HomeScreen
        accounts={runtime.accounts}
        columns={size.columns}
        rows={size.rows}
        onSelect={(account) => setScreen({ kind: "list", account })}
        onAdd={() => setScreen({ kind: "add-account" })}
      />
    );
  }

  if (screen.kind === "add-account") {
    return (
      <AddAccountScreen
        runtime={runtime}
        onBack={() => setScreen({ kind: "home" })}
        onConnected={() => setScreen({ kind: "home" })}
      />
    );
  }

  if (screen.kind === "list") {
    return (
      <MessageListScreen
        account={screen.account}
        mail={runtime.mail}
        columns={size.columns}
        onBack={() => setScreen({ kind: "home" })}
        onRead={(message) => setScreen({ kind: "reader", account: screen.account, message })}
      />
    );
  }

  return (
    <ReaderScreen
      account={screen.account}
      summary={screen.message}
      mail={runtime.mail}
      rows={size.rows}
      onBack={() => setScreen({ kind: "list", account: screen.account })}
    />
  );
}
