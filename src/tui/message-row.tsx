import { Text } from "ink";
import type { MessageSummary } from "../domain/message.js";
import { cleanSummary, displayAddress, formatReceivedAt, padToWidth } from "./format.js";

export function MessageRow({
  message: rawMessage,
  selected,
  columns,
}: {
  readonly message: MessageSummary;
  readonly selected: boolean;
  readonly columns: number;
}) {
  const message = cleanSummary(rawMessage);
  const showDate = columns >= 65;
  const showSnippet = columns >= 80;
  const senderWidth = columns < 65 ? 14 : 20;
  const fixedWidth = 2 + 2 + senderWidth + (showDate ? 13 : 0);
  const contentWidth = Math.max(8, columns - fixedWidth - 2);
  const subject = message.subject ?? "(no subject)";
  const subjectAndSnippet = showSnippet
    ? `${subject}${message.snippet ? ` — ${message.snippet}` : ""}`
    : subject;

  return (
    <Text
      {...(selected && !process.env.NO_COLOR ? { color: "cyan" as const } : {})}
      bold={selected || message.unread}
    >
      {selected ? "›" : " "} {message.unread ? "●" : " "}{" "}
      {padToWidth(displayAddress(message.sender), senderWidth)}
      {padToWidth(subjectAndSnippet, contentWidth)}
      {showDate
        ? ` ${message.hasAttachments ? "◆" : " "} ${formatReceivedAt(message.receivedAt)}`
        : ""}
    </Text>
  );
}
