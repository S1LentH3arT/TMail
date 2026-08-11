import { useEffect, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { AccountRepository } from "../accounts/account-repository.js";
import type { Account } from "../domain/account.js";
import { Logo } from "./logo.js";

interface HomeScreenProps {
  readonly accounts: AccountRepository;
  readonly columns: number;
  readonly rows: number;
  readonly onSelect: (account: Account) => void;
}

function providerLabel(account: Account): string {
  switch (account.provider) {
    case "gmail":
      return "Gmail";
    case "outlook":
      return "Outlook";
    case "proton":
      return "Proton Mail";
    case "demo":
      return "Demo";
  }
}

export function HomeScreen({ accounts: repository, columns, rows, onSelect }: HomeScreenProps) {
  const { exit } = useApp();
  const [accounts, setAccounts] = useState<readonly Account[]>([]);
  const [selected, setSelected] = useState(0);
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    void repository.list().then(setAccounts);
  }, [repository]);

  const itemCount = accounts.length + 1;
  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setSelected((current) => (current - 1 + itemCount) % itemCount);
    } else if (key.downArrow || input === "j") {
      setSelected((current) => (current + 1) % itemCount);
    } else if (key.return || input === "l") {
      const account = accounts[selected];
      if (account) {
        onSelect(account);
      } else {
        setNotice(
          "Gmail, Outlook, and Proton Mail connections are planned for the next milestones.",
        );
      }
    } else if (input === "q") {
      exit();
    }
  });

  const showStatus = columns >= 80;
  const showProvider = columns >= 65;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo compact={rows < 20 || columns < 54} />
      <Box marginTop={1} marginBottom={1}>
        <Text bold>Select an account</Text>
      </Box>
      {accounts.map((account, index) => {
        const active = selected === index;
        return (
          <Box key={account.id}>
            <Text
              {...(active && !process.env.NO_COLOR ? { color: "cyan" as const } : {})}
              bold={active}
            >
              {active ? "›" : " "}{" "}
              {account.address.padEnd(Math.min(32, Math.max(20, columns - 44)))}
            </Text>
            {showProvider ? <Text dimColor>{providerLabel(account).padEnd(16)}</Text> : null}
            {showStatus ? (
              <Text {...(!process.env.NO_COLOR ? { color: "green" as const } : {})}>
                ● {account.status}
              </Text>
            ) : null}
          </Box>
        );
      })}
      <Text
        {...(selected === accounts.length && !process.env.NO_COLOR
          ? { color: "cyan" as const }
          : {})}
        bold={selected === accounts.length}
      >
        {selected === accounts.length ? "›" : " "} + Add account
      </Text>
      {notice ? (
        <Box marginTop={1}>
          <Text {...(!process.env.NO_COLOR ? { color: "yellow" as const } : {})}>! {notice}</Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>↑/↓ select · Enter open · q quit · ? help</Text>
      </Box>
    </Box>
  );
}
