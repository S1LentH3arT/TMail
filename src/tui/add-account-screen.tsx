import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { toTmailError } from "../domain/errors.js";
import type { TmailRuntime } from "../runtime.js";
import { openExternal } from "./open-external.js";

interface AddAccountScreenProps {
  readonly runtime: TmailRuntime;
  readonly onBack: () => void;
  readonly onConnected: () => void;
}

export function AddAccountScreen({ runtime, onBack, onConnected }: AddAccountScreenProps) {
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const providers = [
    {
      id: "gmail",
      label: "Gmail",
      status: runtime.gmail.configured ? "preview" : "not configured",
    },
    { id: "outlook", label: "Outlook", status: "planned" },
    { id: "proton", label: "Proton Mail", status: "planned" },
  ] as const;

  useEffect(() => () => controller.current?.abort(), []);

  useInput((input, key) => {
    if (key.escape) {
      if (busy) {
        controller.current?.abort();
      } else {
        onBack();
      }
      return;
    }
    if (busy) {
      return;
    }
    if (key.upArrow || input === "k") {
      setSelected((current) => (current - 1 + providers.length) % providers.length);
    } else if (key.downArrow || input === "j") {
      setSelected((current) => (current + 1) % providers.length);
    } else if (key.return) {
      const provider = providers[selected];
      if (provider?.id !== "gmail") {
        setError(`${provider?.label ?? "This provider"} is planned but is not available yet.`);
        return;
      }
      if (!runtime.gmail.configured) {
        setStatus(undefined);
        setError(
          "Gmail OAuth is not configured. Set TMAIL_GOOGLE_CLIENT_ID to an approved Desktop app client ID.",
        );
        return;
      }
      const authorization = new AbortController();
      controller.current = authorization;
      setBusy(true);
      setError(undefined);
      setStatus("Starting Gmail authorization…");
      void runtime.gmail
        .authorize(
          {
            showAuthorization: (url) => {
              setStatus("Complete authorization in your browser. Esc cancels.");
              openExternal(url);
            },
          },
          authorization.signal,
        )
        .then((result) => runtime.accounts.connectGmail(result))
        .then(() => onConnected())
        .catch((cause: unknown) => {
          const failure = toTmailError(cause);
          setStatus(undefined);
          if (failure.code === "CANCELLED") {
            setError(undefined);
          } else {
            setError(failure.message);
          }
        })
        .finally(() => {
          setBusy(false);
          controller.current = undefined;
        });
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Add an account</Text>
      <Box marginTop={1} flexDirection="column">
        {providers.map((provider, index) => (
          <Text
            key={provider.id}
            bold={selected === index}
            {...(selected === index && !process.env.NO_COLOR ? { color: "cyan" as const } : {})}
          >
            {selected === index ? "›" : " "} {provider.label.padEnd(16)} {provider.status}
          </Text>
        ))}
      </Box>
      {status ? (
        <Box marginTop={1}>
          <Text dimColor>{status}</Text>
        </Box>
      ) : null}
      {error ? (
        <Box marginTop={1}>
          <Text {...(!process.env.NO_COLOR ? { color: "red" as const } : {})}>× {error}</Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>↑/↓ select · Enter connect · Esc back</Text>
      </Box>
    </Box>
  );
}
