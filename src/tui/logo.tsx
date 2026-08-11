import { Box, Text } from "ink";

const logo = [
  "████████╗███╗   ███╗ █████╗ ██╗██╗     ",
  "╚══██╔══╝████╗ ████║██╔══██╗██║██║     ",
  "   ██║   ██╔████╔██║███████║██║██║     ",
  "   ██║   ██║╚██╔╝██║██╔══██║██║██║     ",
  "   ██║   ██║ ╚═╝ ██║██║  ██║██║███████╗",
  "   ╚═╝   ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝╚══════╝",
];

export function Logo({ compact = false }: { readonly compact?: boolean }) {
  if (compact) {
    return <Text bold>TMail</Text>;
  }
  return (
    <Box flexDirection="column">
      {logo.map((line) => (
        <Text key={line} {...(!process.env.NO_COLOR ? { color: "cyan" as const } : {})} bold>
          {line}
        </Text>
      ))}
    </Box>
  );
}
