import type { SettingsState } from "@getpaseo/plugin/client";
import { useMemo, useRef } from "react";
import type { output, ZodType } from "zod";

const WAIT_STEP_MS = 25;
const WAIT_LIMIT_MS = 1500;

/** JSON with sorted keys, so two equal documents compare equal whatever their key order. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export interface SettingsSaver<Values> {
  /** Resolves false when the save failed or another client changed the document first. */
  save(values: Values): Promise<boolean>;
  /** True while a save is queued or running. */
  busy(): boolean;
}

/**
 * Saves one settings document one write at a time.
 *
 * Paseo rejects a save made against an older revision. Two quick changes hit this: the second
 * save still carries the revision from before the first one. When the only newer revision is
 * this client's own previous save, the save is retried on it. A change from another client still
 * fails the save, so it is never overwritten.
 *
 * `read` returns the document as last rendered.
 */
export function createSettingsSaver<Schema extends ZodType>(
  read: () => SettingsState<Schema>,
): SettingsSaver<output<Schema>> {
  let queue: Promise<unknown> = Promise.resolve();
  let running = 0;
  let written: string | null = null;

  const waitForNewer = async (revision: string) => {
    for (let waited = 0; waited <= WAIT_LIMIT_MS; waited += WAIT_STEP_MS) {
      const current = read();
      if (current.status === "ready" && current.revision !== revision) return current;
      await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
    }
    return null;
  };

  const write = async (values: output<Schema>): Promise<boolean> => {
    const first = read();
    if (first.status !== "ready") return false;
    const json = stableJson(values);
    if (await first.save(values, first.revision)) {
      written = json;
      return true;
    }
    const newer = await waitForNewer(first.revision);
    if (!newer || newer.status !== "ready") return false;
    if (written === null || stableJson(newer.values) !== written) return false;
    if (!(await newer.save(values, newer.revision))) return false;
    written = json;
    return true;
  };

  return {
    save(values) {
      running += 1;
      const result = queue
        .then(() => write(values))
        .finally(() => {
          running -= 1;
        });
      queue = result.catch(() => undefined);
      return result;
    },
    busy: () => running > 0,
  };
}

/** `createSettingsSaver` for a document read with `useSettings`. */
export function useSettingsSaver<Schema extends ZodType>(
  state: SettingsState<Schema>,
): SettingsSaver<output<Schema>> {
  const latest = useRef(state);
  latest.current = state;
  return useMemo(() => createSettingsSaver(() => latest.current), []);
}
