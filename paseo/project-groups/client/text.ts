/** `Intl.Segmenter`, where the JavaScript engine has it. Hermes on the native apps does not. */
type GraphemeSegmenter = new (
  locale: undefined,
  options: { granularity: "grapheme" },
) => { segment(text: string): Iterable<{ segment: string }> };

const Segmenter = (Intl as unknown as { Segmenter?: GraphemeSegmenter }).Segmenter;

/** Code points that attach to the character before them inside one emoji or letter. */
function attaches(codePoint: number): boolean {
  return (
    codePoint === 0x200d || // zero width joiner
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) || // variation selectors
    (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff) || // skin tones
    (codePoint >= 0xe0020 && codePoint <= 0xe007f) || // tag sequences, as in subdivision flags
    (codePoint >= 0x0300 && codePoint <= 0x036f) || // combining marks
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) || // includes the keycap mark
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  );
}

const isRegional = (codePoint: number) => codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;

/** Splits text into what a reader sees as single characters, whole emoji included. */
export function graphemes(text: string): string[] {
  if (!Segmenter) return graphemesWithoutSegmenter(text);
  return Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(text), (part) => part.segment);
}

/** Close enough to `Intl.Segmenter` for emoji, flags and accented letters. */
export function graphemesWithoutSegmenter(text: string): string[] {
  const parts: string[] = [];
  let afterJoiner = false;
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    const last = parts.length - 1;
    const previous = last >= 0 ? Array.from(parts[last]) : [];
    // Two regional indicators make one flag.
    const flagPair =
      isRegional(codePoint) && previous.length === 1 && isRegional(previous[0].codePointAt(0) ?? 0);
    if (last >= 0 && (attaches(codePoint) || afterJoiner || flagPair)) parts[last] += char;
    else parts.push(char);
    afterJoiner = codePoint === 0x200d;
  }
  return parts;
}

/** At most `count` visible characters from the start of `text`, never cutting an emoji apart. */
export function firstGraphemes(text: string, count: number): string {
  return graphemes(text).slice(0, count).join("");
}
