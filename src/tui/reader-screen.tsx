import { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { MailService } from "../application/mail-service.js";
import type { Account } from "../domain/account.js";
import { toTmailError } from "../domain/errors.js";
import type { Message, MessageSummary } from "../domain/message.js";
import { normalizeBody, type NormalizedBody } from "../body/normalize.js";
import { renderBody } from "./render-body.js";
import { openExternal } from "./open-external.js";

interface ReaderScreenProps {
  readonly account: Account;
  readonly summary: MessageSummary;
  readonly mail: MailService;
  readonly rows: number;
  readonly onBack: () => void;
}

const HEADER_ALLOWLIST = ["message-id", "reply-to", "content-type"];

function addresses(items: Message["to"]): string {
  return items
    .map((item) => (item.name ? `${item.name} <${item.address}>` : item.address))
    .join(", ");
}

export function ReaderScreen({ account, summary, mail, rows, onBack }: ReaderScreenProps) {
  const [message, setMessage] = useState<Message>();
  const [body, setBody] = useState<NormalizedBody>();
  const [error, setError] = useState<string>();
  const [scroll, setScroll] = useState(0);
  const [showHeaders, setShowHeaders] = useState(false);
  const [linkChoice, setLinkChoice] = useState<number>();
  const [confirmLink, setConfirmLink] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void mail
      .read(account.id, summary.id, controller.signal)
      .then(async (loaded) => {
        const normalized = await normalizeBody(loaded.body);
        if (!controller.signal.aborted) {
          setMessage(loaded);
          setBody(normalized);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(toTmailError(cause).message);
        }
      });
    return () => controller.abort();
  }, [account.id, mail, summary.id]);

  const rendered = useMemo(() => (body ? renderBody(body.root) : { lines: [], links: [] }), [body]);
  const viewportHeight = Math.max(3, rows - 11 - (showHeaders ? HEADER_ALLOWLIST.length : 0));
  const maximumScroll = Math.max(0, rendered.lines.length - viewportHeight);

  useInput((input, key) => {
    if (linkChoice !== undefined) {
      if (key.escape) {
        setLinkChoice(undefined);
        setConfirmLink(false);
      } else if (key.upArrow || input === "k") {
        setLinkChoice((current = 0) => Math.max(0, current - 1));
        setConfirmLink(false);
      } else if (key.downArrow || input === "j") {
        setLinkChoice((current = 0) => Math.min(rendered.links.length - 1, current + 1));
        setConfirmLink(false);
      } else if (key.return) {
        const url = rendered.links[linkChoice];
        if (url && confirmLink) {
          openExternal(url);
          setLinkChoice(undefined);
          setConfirmLink(false);
        } else if (url) {
          setConfirmLink(true);
        }
      }
      return;
    }

    if (key.escape || input === "h") {
      onBack();
    } else if (key.upArrow || input === "k") {
      setScroll((current) => Math.max(0, current - 1));
    } else if (key.downArrow || input === "j") {
      setScroll((current) => Math.min(maximumScroll, current + 1));
    } else if (input === "i") {
      setShowHeaders((current) => !current);
    } else if (input === "o" && rendered.links.length > 0) {
      setLinkChoice(0);
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>{message?.subject ?? summary.subject}</Text>
      <Text>From: {message ? addresses([message.sender]) : summary.sender.address}</Text>
      {message ? <Text>To: {addresses(message.to)}</Text> : null}
      <Text>
        Date: {new Date(message?.receivedAt ?? summary.receivedAt).toLocaleString("en-US")}
      </Text>
      {showHeaders && message
        ? HEADER_ALLOWLIST.map((name) => (
            <Text key={name} dimColor>
              {name}: {message.headers[name] ?? "—"}
            </Text>
          ))
        : null}
      <Text dimColor>────────</Text>
      {error ? (
        <Text {...(!process.env.NO_COLOR ? { color: "red" as const } : {})}>× {error}</Text>
      ) : null}
      {!body && !error ? <Text dimColor>Loading message…</Text> : null}
      {body ? (
        <Text wrap="truncate-end">
          {rendered.lines
            .slice(scroll, scroll + viewportHeight)
            .map((line) => line || " ")
            .join("\n")}
        </Text>
      ) : null}
      {body?.truncated ? (
        <Text {...(!process.env.NO_COLOR ? { color: "yellow" as const } : {})}>
          ! Body truncated safely.
        </Text>
      ) : null}
      {message?.attachments.map((attachment) => (
        <Text key={attachment.id} dimColor>
          ◆ {attachment.filename} · {attachment.contentType} · {attachment.size} bytes
        </Text>
      ))}
      {linkChoice !== undefined ? (
        <Text {...(!process.env.NO_COLOR ? { color: "yellow" as const } : {})}>
          Link {linkChoice + 1}/{rendered.links.length}: {rendered.links[linkChoice]}{" "}
          {confirmLink ? "· Enter to open externally" : "· Enter to confirm"}
        </Text>
      ) : null}
      <Text dimColor>↑/↓ scroll · i headers · o links · Esc back</Text>
    </Box>
  );
}
