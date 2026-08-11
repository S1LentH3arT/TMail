import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { MailService } from "../application/mail-service.js";
import type { Account } from "../domain/account.js";
import type { MessageSummary } from "../domain/message.js";
import { toTmailError } from "../domain/errors.js";
import { MessageRow } from "./message-row.js";

interface MessageListScreenProps {
  readonly account: Account;
  readonly mail: MailService;
  readonly columns: number;
  readonly onBack: () => void;
  readonly onRead: (message: MessageSummary) => void;
}

export function MessageListScreen({
  account,
  mail,
  columns,
  onBack,
  onRead,
}: MessageListScreenProps) {
  const [messages, setMessages] = useState<readonly MessageSummary[]>([]);
  const [selected, setSelected] = useState(0);
  const [nextCursor, setNextCursor] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadingNext, setLoadingNext] = useState(false);
  const [error, setError] = useState<string>();
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const request = useRef<AbortController | undefined>(undefined);

  const load = useCallback(
    async (searchQuery: string, cursor?: string, append = false, preserveMessageId?: string) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      append ? setLoadingNext(true) : setLoading(true);
      setError(undefined);
      try {
        const page = searchQuery
          ? await mail.search(account.id, searchQuery, {
              ...(cursor ? { cursor } : {}),
              signal: controller.signal,
            })
          : await mail.list(account.id, {
              ...(cursor ? { cursor } : {}),
              signal: controller.signal,
            });
        if (controller.signal.aborted) {
          return;
        }
        setMessages((current) => {
          const combined = append ? [...current, ...page.messages] : [...page.messages];
          return [...new Map(combined.map((message) => [message.id, message])).values()];
        });
        setNextCursor(page.nextCursor);
        if (!append) {
          const preservedIndex = preserveMessageId
            ? page.messages.findIndex((message) => message.id === preserveMessageId)
            : -1;
          setSelected(Math.max(0, preservedIndex));
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(toTmailError(cause).message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingNext(false);
        }
      }
    },
    [account.id, mail],
  );

  useEffect(() => {
    void load(activeQuery);
    return () => request.current?.abort();
  }, [activeQuery, load]);

  useEffect(() => {
    if (!searchMode) {
      return;
    }
    const timer = setTimeout(() => setActiveQuery(query.trim()), 250);
    return () => {
      clearTimeout(timer);
    };
  }, [query, searchMode]);

  useEffect(() => {
    if (nextCursor && selected >= messages.length - 5 && !loadingNext) {
      void load(activeQuery, nextCursor, true);
    }
  }, [activeQuery, load, loadingNext, messages.length, nextCursor, selected]);

  useInput((input, key) => {
    if (searchMode) {
      if (key.escape) {
        setSearchMode(false);
        setQuery("");
        setActiveQuery("");
      } else if (key.backspace || key.delete) {
        setQuery((current) => Array.from(current).slice(0, -1).join(""));
      } else if (key.return) {
        setActiveQuery(query.trim());
        setSearchMode(false);
      } else if (!key.ctrl && !key.meta && input) {
        setQuery((current) => `${current}${input}`);
      }
      return;
    }

    if (key.upArrow || input === "k") {
      setSelected((current) => Math.max(0, current - 1));
    } else if (key.downArrow || input === "j") {
      setSelected((current) => Math.min(messages.length - 1, current + 1));
    } else if (key.return || input === "l") {
      const message = messages[selected];
      if (message) {
        onRead(message);
      }
    } else if (key.escape || input === "h") {
      if (activeQuery) {
        setQuery("");
        setActiveQuery("");
      } else {
        onBack();
      }
    } else if (input === "/") {
      setSearchMode(true);
      setQuery(activeQuery);
    } else if (input === "r") {
      const selectedId = messages[selected]?.id;
      void load(activeQuery, undefined, false, selectedId);
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold>{account.address}</Text>
        <Text dimColor>Inbox</Text>
      </Box>
      <Text dimColor>{"─".repeat(Math.max(1, columns - 2))}</Text>
      {searchMode ? (
        <Text {...(!process.env.NO_COLOR ? { color: "cyan" as const } : {})}>
          Search Inbox: {query}▌
        </Text>
      ) : activeQuery ? (
        <Text dimColor>Results for “{activeQuery}”</Text>
      ) : null}
      {loading ? <Text dimColor>Loading messages…</Text> : null}
      {!loading && error ? (
        <Text {...(!process.env.NO_COLOR ? { color: "red" as const } : {})}>× {error}</Text>
      ) : null}
      {!loading && !error && messages.length === 0 ? (
        <Text dimColor>No messages found.</Text>
      ) : null}
      {!loading
        ? messages.map((message, index) => (
            <MessageRow
              key={message.id}
              message={message}
              selected={selected === index}
              columns={columns}
            />
          ))
        : null}
      {loadingNext ? <Text dimColor> Loading more…</Text> : null}
      {error && nextCursor ? (
        <Text {...(!process.env.NO_COLOR ? { color: "yellow" as const } : {})}>
          Retry loading more
        </Text>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>↑/↓ browse · Enter read · / search · r refresh · Esc back</Text>
      </Box>
    </Box>
  );
}
