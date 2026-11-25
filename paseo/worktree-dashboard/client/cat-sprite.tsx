import { memo, useMemo } from "react";
import { View } from "react-native";
import type { AgentState } from "./state";

const standingCat = [
  '..OO.....OO.........',
  '.OHFO...OFHO........',
  '.OHFFOOOFFHO........',
  '.OHFFFFFFFFO........',
  'OHFFFFFFFFFHO.......',
  'OFFYFFFFYFFFO.......',
  'OFFAFOOFAFFFO....OO.',
  'OHFFFFFFFFFHO...OFO.',
  '.OOFFFFFFFOO...OFO..',
  '...OOOOOOO....OFO...',
  '...OHFFFFO...OFO....',
  '...OFFFFFSO.OFO.....',
  '...OFFFFFFOOFO......',
  '...OFFFFFFSFO.......',
  '...OFSOOFFOO........',
  '...OFO.OFFO.........',
  '...OOO.OOOO.........',
  '....................',
];
const sleepingCat = [
  '....................',
  '....................',
  '....................',
  '...OO.....OO........',
  '..OHHOO.OOFHO.......',
  '..OHFFOOFFFHO.......',
  '..OHFFFFFFFFO.......',
  '.OHFFFFFFFFFHO......',
  '.OFFAAFFAAFFFO......',
  '.OFFFFFFOFFFFOO.....',
  '.OHFFFFFFFFFHOFO....',
  '..OOFFFFFFFOOFFSO...',
  '...OOOOOOOFFFFFFSO..',
  '..OHFFFFFFFFFSFFFO..',
  '..OSSSSFFSOOHFFO....',
  '...OOOOOO..OOOO.....',
  '....................',
  '....................',
];
const palettes = {
  light: { O: '#171719', H: '#464650', F: '#27272f', S: '#212127', Y: '#ffd26d', A: '#eea848' },
  dark: { O: '#101113', H: '#555663', F: '#33333d', S: '#2a2a32', Y: '#ffd26d', A: '#eea848' },
};
type Pose = { sprite?: string[]; face?: string[]; mark: string[] };

const poses: Record<AgentState, Pose> = {
  needs: {
      face: ['YY..YY.', 'YYOOYY.', '...O...'],
    mark: ['.###.', '....#', '..##.', '.....', '..#..'],
  },
  work: {
      mark: ['.....', '.....', '#.#.#', '.....', '.....'],
  },
  ready: {
      face: ['.Y...Y.', 'A.O.O.A', '...O...'],
    mark: ['....#', '...#.', '#.#..', '.#...', '.....'],
  },
  failed: {
      face: ['Y.A.Y.A', '.YO..Y.', 'A.Y.Y.A'],
    mark: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  },
  idle: {
      sprite: sleepingCat,
    mark: ['.###.', '...#.', '..#..', '.#...', '.###.'],
  },
};


type ThemeMode = keyof typeof palettes;
type Pixel = keyof typeof palettes.light | "#" | ".";
const spriteWidth = 20;
const spriteHeight = 18;

function compileSprite(state: AgentState) {
  const { sprite = standingCat, face, mark } = poses[state];
  const grid = sprite.map(row => [...row] as Pixel[]);
  if (face) {
    face.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        grid[y + 5][x + 3] = cell === "." ? "F" : cell as Pixel;
      });
    });
  }
  mark.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === "#") grid[y][x + 14] = "#";
    });
  });

  // Run-length encode the rows so repeated icons use fewer native views.
  return grid.flatMap((row, y) => {
    const runs: { x: number; y: number; width: number; pixel: Exclude<Pixel, "."> }[] = [];
    for (let start = 0; start < row.length;) {
      const pixel = row[start];
      let end = start + 1;
      while (row[end] === pixel) end++;
      if (pixel !== ".") runs.push({ x: start, y, width: end - start, pixel });
      start = end;
    }
    return runs;
  });
}

const sprites = {
  needs: compileSprite("needs"),
  work: compileSprite("work"),
  ready: compileSprite("ready"),
  failed: compileSprite("failed"),
  idle: compileSprite("idle"),
};

export const CatSprite = memo(function CatSprite({ state, markColor, mode, scale = 2 }: {
  state: AgentState;
  markColor: string;
  mode: ThemeMode;
  scale?: 1 | 2;
}) {
  const pixels = useMemo(() => sprites[state].map(({ x, y, width, pixel }) => (
    <View
      key={`${x},${y}`}
      pointerEvents="none"
      style={{
        position: "absolute", left: x * scale, top: y * scale, width: width * scale,
        height: scale, backgroundColor: pixel === "#" ? markColor : palettes[mode][pixel],
      }}
    />
  )), [state, markColor, mode, scale]);

  return (
    <View
      aria-hidden
      pointerEvents="none"
      style={{ width: spriteWidth * scale, height: spriteHeight * scale, flexShrink: 0 }}
    >
      {pixels}
    </View>
  );
});
