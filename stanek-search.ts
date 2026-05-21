// Deterministic Stanek layout search for a 7W x 6H gift.
// Run locally with: nix develop --command npx? (or compile with tsc after enabling emit)
// Defaults are BN13.3-friendly: width=7 height=6 maxNodes=2000000.

type Shape = boolean[][];
type Placement = { id: number; x: number; y: number; rotation: number; cells: [number, number][] };
type Fragment = { id: number; name: string; shape: Shape; limit: number; area: number; priority: number };

declare const process: { argv: string[]; exitCode?: number } | undefined;

const X = true;
const _ = false;

const Shapes: Record<string, Shape> = {
  O: [[X, X], [X, X]],
  I: [[X, X, X, X]],
  L: [[_, _, X], [X, X, X]],
  J: [[X, _, _], [X, X, X]],
  S: [[_, X, X], [X, X, _]],
  Z: [[X, X, _], [_, X, X]],
  T: [[X, X, X], [_, X, _]],
};

const FragmentDefs: Omit<Fragment, "area" | "priority">[] = [
  { id: 0, name: "Hacking S", shape: Shapes.S, limit: 1 },
  { id: 1, name: "Hacking Z", shape: Shapes.Z, limit: 1 },
  { id: 5, name: "HackingSpeed T", shape: Shapes.T, limit: 1 },
  { id: 6, name: "HackingMoney I", shape: Shapes.I, limit: 1 },
  { id: 7, name: "HackingGrow J", shape: Shapes.J, limit: 1 },
  { id: 10, name: "Strength T", shape: Shapes.T, limit: 1 },
  { id: 12, name: "Defense L", shape: Shapes.L, limit: 1 },
  { id: 14, name: "Dexterity L", shape: Shapes.L, limit: 1 },
  { id: 16, name: "Agility S", shape: Shapes.S, limit: 1 },
  { id: 18, name: "Charisma S", shape: Shapes.S, limit: 1 },
  { id: 20, name: "HacknetMoney I", shape: Shapes.I, limit: 1 },
  { id: 21, name: "HacknetCost O", shape: Shapes.O, limit: 1 },
  { id: 25, name: "Rep J", shape: Shapes.J, limit: 1 },
  { id: 27, name: "WorkMoney J", shape: Shapes.J, limit: 1 },
  { id: 28, name: "Crime L", shape: Shapes.L, limit: 1 },
  { id: 30, name: "Bladeburner S", shape: Shapes.S, limit: 1 },
  { id: 100, name: "Booster 100", shape: [[_, X, X], [X, X, _], [_, X, _]], limit: 99 },
  { id: 101, name: "Booster 101", shape: [[X, X, X, X], [X, _, _, _]], limit: 99 },
  { id: 102, name: "Booster 102", shape: [[_, X, X, X], [X, X, _, _]], limit: 99 },
  { id: 103, name: "Booster 103", shape: [[X, X, X, _], [_, _, X, X]], limit: 99 },
  { id: 104, name: "Booster 104", shape: [[_, X, X], [_, X, _], [X, X, _]], limit: 99 },
  { id: 105, name: "Booster 105", shape: [[_, _, X], [_, X, X], [X, X, _]], limit: 99 },
  { id: 106, name: "Booster 106", shape: [[X, _, _], [X, X, X], [X, _, _]], limit: 99 },
  { id: 107, name: "Booster 107", shape: [[_, X, _], [X, X, X], [_, X, _]], limit: 99 },
];

const HackingFragmentIds = new Set([0, 1, 5, 6, 7]);
const Fragments: Fragment[] = FragmentDefs.map((f) => ({
  ...f,
  area: f.shape.flat().filter(Boolean).length,
  // Prefer actual hacking stat fragments over boosters/other stats when fill is tied.
  priority: HackingFragmentIds.has(f.id) ? 100 : f.id >= 100 ? 10 : 0,
}));

function fullAt(shape: Shape, x: number, y: number, r: number): boolean {
  const h = r % 2 === 0 ? shape.length : shape[0].length;
  const w = r % 2 === 0 ? shape[0].length : shape.length;
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  let [sx, sy, mx, my] = [0, 0, 1, 1];
  if (r === 1) [sx, sy, mx, my] = [w - 1, 0, -1, 1];
  else if (r === 2) [sx, sy, mx, my] = [w - 1, h - 1, -1, -1];
  else if (r === 3) [sx, sy, mx, my] = [0, h - 1, 1, -1];
  let [qx, qy] = [sx + mx * x, sy + my * y];
  if (r % 2 === 1) [qx, qy] = [qy, qx];
  return shape[qy][qx];
}

function rotatedCells(f: Fragment, x0: number, y0: number, r: number): [number, number][] {
  const h = r % 2 === 0 ? f.shape.length : f.shape[0].length;
  const w = r % 2 === 0 ? f.shape[0].length : f.shape.length;
  const cells: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fullAt(f.shape, x, y, r)) cells.push([x0 + x, y0 + y]);
  return cells;
}

function main(): void {
  const argv = typeof process === "undefined" ? [] : process.argv.slice(2);
  const width = Number(argv[0] ?? 7), height = Number(argv[1] ?? 6), maxNodes = Number(argv[2] ?? 2_000_000);
  const boardArea = width * height;
  const counts = new Map<number, number>();
  let nodes = 0, bestArea = -1, bestScore = -1;
  let best: Placement[] = [];
  const used = new Uint8Array(boardArea);

  const all: Placement[] = [];
  for (const f of Fragments) for (let r = 0; r < 4; r++) {
    const h = r % 2 === 0 ? f.shape.length : f.shape[0].length;
    const w = r % 2 === 0 ? f.shape[0].length : f.shape.length;
    for (let y = 0; y <= height - h; y++) for (let x = 0; x <= width - w; x++) all.push({ id: f.id, x, y, rotation: r, cells: rotatedCells(f, x, y, r) });
  }
  const fragById = new Map(Fragments.map((f) => [f.id, f]));
  all.sort((a, b) =>
    a.cells[0][1] - b.cells[0][1] ||
    a.cells[0][0] - b.cells[0][0] ||
    (fragById.get(b.id)?.priority ?? 0) - (fragById.get(a.id)?.priority ?? 0) ||
    b.cells.length - a.cells.length ||
    a.id - b.id ||
    a.rotation - b.rotation,
  );

  const chosen: Placement[] = [];
  function dfs(start: number, area: number): void {
    if (++nodes > maxNodes || bestArea === boardArea) return;
    const score = chosen.reduce((sum, p) => sum + (fragById.get(p.id)?.priority ?? 0), 0) * 1000 + chosen.length;
    if (area > bestArea || (area === bestArea && score > bestScore)) { bestArea = area; bestScore = score; best = chosen.map((p) => ({ ...p, cells: [...p.cells] })); }
    for (let i = start; i < all.length; i++) {
      const p = all[i], frag = fragById.get(p.id)!;
      if ((counts.get(p.id) ?? 0) >= frag.limit) continue;
      if (p.cells.some(([x, y]) => used[y * width + x])) continue;
      counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
      for (const [x, y] of p.cells) used[y * width + x] = 1;
      chosen.push(p);
      dfs(i + 1, area + p.cells.length);
      chosen.pop();
      for (const [x, y] of p.cells) used[y * width + x] = 0;
      counts.set(p.id, (counts.get(p.id) ?? 1) - 1);
      if (nodes > maxNodes || bestArea === boardArea) return;
    }
  }

  dfs(0, 0);
  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => "."));
  best.forEach((p, i) => p.cells.forEach(([x, y]) => { grid[y][x] = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"[i % 36]; }));
  console.log(`searched nodes=${nodes} board=${width}x${height} filled=${bestArea}/${boardArea} fragments=${best.length}`);
  console.log(grid.map((r) => r.join("")).join("\n"));
  console.log(JSON.stringify(best.map(({ id, x, y, rotation }) => ({ id, x, y, rotation })), null, 2));
  console.log(best.map((p) => `ns.stanek.placeFragment(${p.x}, ${p.y}, ${p.rotation}, ${p.id});`).join("\n"));
}

main();
