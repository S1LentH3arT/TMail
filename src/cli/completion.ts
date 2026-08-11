const commandTree = [
  "accounts list",
  "accounts add",
  "accounts remove",
  "messages list",
  "messages read",
  "messages search",
  "doctor",
  "completion",
];

export type SupportedShell = "bash" | "zsh" | "fish";

export function completionScript(shell: SupportedShell): string {
  const words = commandTree
    .map((item) => item.split(" ")[0])
    .filter((item, index, all) => all.indexOf(item) === index);
  switch (shell) {
    case "bash":
      return `_tmail_complete() { COMPREPLY=( $(compgen -W "${words.join(" ")}" -- "\${COMP_WORDS[1]}") ); }\ncomplete -F _tmail_complete tmail\n`;
    case "zsh":
      return `#compdef tmail\n_arguments '1:command:(${words.join(" ")})'\n`;
    case "fish":
      return `${words.map((word) => `complete -c tmail -n '__fish_use_subcommand' -a '${word}'`).join("\n")}\n`;
  }
}
