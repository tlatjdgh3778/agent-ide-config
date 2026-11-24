import { useEffect, useState } from "react";

// The app's interface font is a user setting that the plugin theme does not carry.
// On web and desktop, read it off a text the app itself draws in the sidebar header,
// so this view follows whatever font the user picked. Native gets the default.
const PROBE = '[data-testid="sidebar-global-new-workspace"]';

// Only the DOM bits used here; the plugin compiles without the DOM lib since it also runs native.
interface Node {
  querySelector(selector: string): Node | null;
}
interface Doc extends Node {
  defaultView: { getComputedStyle(node: Node): { fontFamily: string } } | null;
}

function readFont(): string | undefined {
  const doc = (globalThis as { document?: Doc }).document;
  const root = doc?.querySelector(PROBE);
  if (!root) return undefined;
  const text = root.querySelector('[dir="auto"]') ?? root;
  const family = doc?.defaultView?.getComputedStyle(text).fontFamily;
  return family || undefined;
}

export function useAppFont(): string | undefined {
  const [font, setFont] = useState<string | undefined>(readFont);
  useEffect(() => {
    if (font) return;
    // The header may render after this view on first paint.
    const timer = setInterval(() => {
      const found = readFont();
      if (found) {
        setFont(found);
        clearInterval(timer);
      }
    }, 300);
    const stop = setTimeout(() => clearInterval(timer), 5000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [font]);
  return font;
}
