import stringWidth from "string-width";
import type { MailAddress, MessageSummary } from "../domain/message.js";

export function truncateToWidth(value: string, width: number): string {
  if (width <= 0) {
    return "";
  }
  if (stringWidth(value) <= width) {
    return value;
  }
  if (width === 1) {
    return "…";
  }

  let result = "";
  for (const character of value) {
    if (stringWidth(result + character) > width - 1) {
      break;
    }
    result += character;
  }
  return `${result}…`;
}

export function padToWidth(value: string, width: number): string {
  const truncated = truncateToWidth(value, width);
  return `${truncated}${" ".repeat(Math.max(0, width - stringWidth(truncated)))}`;
}

export function displayAddress(sender: MailAddress): string {
  return sender.name?.trim() || sender.address || "(unknown sender)";
}

export function formatReceivedAt(value: string | null, now = new Date()): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameDay =
    sameYear && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();

  return new Intl.DateTimeFormat("en-US", {
    ...(sameDay ? { hour: "2-digit", minute: "2-digit" } : { month: "short", day: "2-digit" }),
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}

export function cleanSummary(message: MessageSummary): MessageSummary {
  const clean = (value: string | null) =>
    value
      ? value
          .replace(/[\r\n\t]+/gu, " ")
          .replace(/\s+/gu, " ")
          .trim()
      : "";
  return {
    ...message,
    sender: {
      address: message.sender.address,
      ...(message.sender.name ? { name: clean(message.sender.name) } : {}),
    },
    subject: clean(message.subject) || "(no subject)",
    snippet: clean(message.snippet) || null,
  };
}
