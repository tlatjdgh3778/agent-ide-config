import { useCallback, useEffect, useRef } from "react";
import { useSettings } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/ui";
import { GroupError, type Machines } from "../shared/groups";
import { groupSettings, viewSettings } from "../shared/settings";

export type Change = (all: Machines) => Machines;

/**
 * The stored groups plus `change`, which saves one edit. A save that loses a race with
 * another device reloads the document and applies the same edit once more; a second
 * failure is reported and the view keeps showing what is stored.
 */
export function useGroups() {
  const settings = useSettings(groupSettings);
  const toast = useToast();
  const retry = useRef<{ change: Change; revision: string } | null>(null);

  const save = useCallback(
    async (change: Change, values: { machines: Machines }, revision: string, last: boolean) => {
      let next: Machines;
      try {
        next = change(values.machines);
      } catch (error) {
        toast.error(error instanceof GroupError ? error.message : String(error));
        return;
      }
      if (next === values.machines) return;
      const saved = await settings.save({ machines: next }, revision);
      if (saved) return;
      if (last) {
        toast.error(settings.saveError ?? "그룹을 저장하지 못했습니다.");
        await settings.reload();
        return;
      }
      retry.current = { change, revision };
      await settings.reload();
    },
    [settings, toast],
  );

  // After a conflict's reload brings a newer revision, try the edit once more on it.
  useEffect(() => {
    const pending = retry.current;
    if (!pending || settings.status !== "ready" || settings.revision === pending.revision) return;
    retry.current = null;
    void save(pending.change, settings.values, settings.revision, true);
  }, [settings, save]);

  const change = useCallback(
    (edit: Change) => {
      if (settings.status !== "ready") return;
      void save(edit, settings.values, settings.revision, false);
    },
    [settings, save],
  );

  return { settings, change };
}

/** Folded headers on this device. */
export function useCollapsed() {
  const settings = useSettings(viewSettings);
  const collapsed = settings.status === "ready" ? settings.values.collapsed : [];
  const toggle = useCallback(
    (key: string) => {
      if (settings.status !== "ready") return;
      const list = settings.values.collapsed;
      void settings.save(
        { collapsed: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] },
        settings.revision,
      );
    },
    [settings],
  );
  return { collapsed, toggle };
}
