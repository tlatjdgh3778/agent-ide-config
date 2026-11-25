import { useEffect, useState } from "react";
import { usePaseo } from "@getpaseo/plugin/client";
import { hasCodexQuestion } from "./state";

const scanIntervalMs = 2500;
const captureLines = 32;
const scanBatchSize = 6;
const empty: ReadonlySet<string> = new Set();

export function useTerminalQuestions(workspaceIds: ReadonlySet<string>): ReadonlySet<string> {
  const paseo = usePaseo();
  const [questions, setQuestions] = useState<ReadonlySet<string>>(empty);

  useEffect(() => {
    if (!workspaceIds.size) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function scan() {
      const next = new Set<string>();
      try {
        const { entries } = await paseo.terminals.list();
        const terminals = entries.filter(entry => workspaceIds.has(entry.workspaceId));
        for (let index = 0; index < terminals.length && !disposed; index += scanBatchSize) {
          await Promise.all(terminals.slice(index, index + scanBatchSize).map(async terminal => {
            try {
              const { lines } = await paseo.terminals.ref(terminal).capture({ start: -captureLines });
              if (hasCodexQuestion(lines)) next.add(terminal.workspaceId);
            } catch {
              // The terminal can close between the list and capture requests.
            }
          }));
        }
      } catch {
        // Some hosts do not expose terminal capture. The board still uses native status.
      }
      if (disposed) return;
      setQuestions(previous => previous.size === next.size && [...next].every(id => previous.has(id))
        ? previous
        : next);
      timer = setTimeout(scan, scanIntervalMs);
    }

    void scan();
    return () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [paseo, workspaceIds]);

  return workspaceIds.size ? questions : empty;
}
