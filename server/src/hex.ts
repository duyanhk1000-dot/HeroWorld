/**
 * Hex grid 7×8 — direct port of scripts/m1_hex.gd (SRS §3).
 * index = row*7+col. Storage uses offset odd-r, pathfinding uses axial.
 */
export const HEX_COLS = 7;
export const HEX_ROWS = 8;
export const BOARD_SIZE = 56;

export function rcToIndex(row: number, col: number): number {
  return row * HEX_COLS + col;
}

export function indexToRow(idx: number): number {
  return Math.floor(idx / HEX_COLS);
}

export function indexToCol(idx: number): number {
  return idx % HEX_COLS;
}

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < HEX_ROWS && col >= 0 && col < HEX_COLS;
}

/** SRS §3.2: q = col − (row − (row & 1)) / 2, r = row. */
export function offsetToAxial(col: number, row: number): { q: number; r: number } {
  const q = col - Math.floor((row - (row & 1)) / 2);
  return { q, r: row };
}

/** SRS §3.2: col = q + (r − (r & 1)) / 2, row = r. */
export function axialToOffset(q: number, r: number): { col: number; row: number } {
  const col = q + Math.floor((r - (r & 1)) / 2);
  return { col, row: r };
}

export function hexDistance(aIdx: number, bIdx: number): number {
  const a = offsetToAxial(indexToCol(aIdx), indexToRow(aIdx));
  const b = offsetToAxial(indexToCol(bIdx), indexToRow(bIdx));
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

const AXIAL_DIRS: [number, number][] = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

export function neighbors(idx: number): number[] {
  const out: number[] = [];
  const ax = offsetToAxial(indexToCol(idx), indexToRow(idx));
  for (const [dq, dr] of AXIAL_DIRS) {
    const o = axialToOffset(ax.q + dq, ax.r + dr);
    if (inBounds(o.row, o.col)) out.push(rcToIndex(o.row, o.col));
  }
  return out;
}

/**
 * BFS: first step from fromIdx toward any cell within `rng` of targetIdx.
 * Cells in `blocked` cannot be entered, except cells already within range
 * of the target. Returns -1 when already in range or no path exists.
 * (Port of M1Hex.bfs_step_toward.)
 */
export function bfsStepToward(fromIdx: number, targetIdx: number, rng: number, blocked: Set<number>): number {
  if (hexDistance(fromIdx, targetIdx) <= rng) return -1;
  const prev = new Map<number, number>();
  const queue: number[] = [fromIdx];
  prev.set(fromIdx, -1);
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    for (const nb of neighbors(cur)) {
      if (prev.has(nb)) continue;
      if (blocked.has(nb)) continue;
      prev.set(nb, cur);
      if (nb !== targetIdx && hexDistance(nb, targetIdx) <= rng) {
        let step = nb;
        while (prev.get(step) !== fromIdx) step = prev.get(step) as number;
        return step;
      }
      queue.push(nb);
    }
  }
  return -1;
}
