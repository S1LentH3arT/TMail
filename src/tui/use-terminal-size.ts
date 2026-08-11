import { useEffect, useState } from "react";

export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

function readTerminalSize(): TerminalSize {
  return {
    columns: process.stdout.columns ?? 80,
    rows: process.stdout.rows ?? 24,
  };
}

export function useTerminalSize(): TerminalSize {
  const [size, setSize] = useState(readTerminalSize);

  useEffect(() => {
    const update = () => setSize(readTerminalSize());
    process.stdout.on("resize", update);
    return () => {
      process.stdout.off("resize", update);
    };
  }, []);

  return size;
}
