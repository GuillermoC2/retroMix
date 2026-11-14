import type { Maze } from './Maze';
import { DX, DY, Tile } from './grid';

/** Tamaño mínimo de una zona abierta para considerarla parte de la red de pasillos (no un agujero suelto). */
const NETWORK_MIN = 40;

/**
 * Casillas de muro que hay que abrir para que (x, y) quede conectada a la red de
 * pasillos: el camino que atraviesa menos muros hasta una zona abierta grande.
 * Sirve cuando un poder deja al jugador encima de un muro o en un agujero aislado.
 * El borde exterior y las filas no generadas no se atraviesan.
 */
export function escapeTiles(maze: Maze, x: number, y: number): Array<{ x: number; y: number }> {
  const key = (tx: number, ty: number) => ty * 64 + tx;
  const crossable = (tx: number, ty: number) => tx > 0 && tx < maze.width - 1 && maze.tile(tx, ty) !== undefined;
  if (!crossable(x, y)) return [];

  const cost = new Map<number, number>([[key(x, y), maze.isOpen(x, y) ? 0 : 1]]);
  const prev = new Map<number, number>();
  const deque: Array<[number, number]> = [[x, y]];
  const checked = new Map<number, boolean>();

  // BFS 0-1: entrar en una casilla abierta no cuesta, en un muro cuesta 1.
  while (deque.length) {
    const [cx, cy] = deque.shift()!;
    const ck = key(cx, cy);
    if (maze.isOpen(cx, cy) && onNetwork(maze, cx, cy, checked)) {
      const walls: Array<{ x: number; y: number }> = [];
      for (let k: number | undefined = ck; k !== undefined; k = prev.get(k)) {
        const tx = k % 64;
        const ty = Math.floor(k / 64);
        if (!maze.isOpen(tx, ty)) walls.push({ x: tx, y: ty });
      }
      return walls;
    }
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (!crossable(nx, ny)) continue;
      const step = maze.isOpen(nx, ny) ? 0 : 1;
      const c = cost.get(ck)! + step;
      const nk = key(nx, ny);
      if (c >= (cost.get(nk) ?? Infinity)) continue;
      cost.set(nk, c);
      prev.set(nk, ck);
      if (step === 0) deque.unshift([nx, ny]);
      else deque.push([nx, ny]);
    }
  }
  return [];
}

/** ¿La casilla abierta pertenece a una zona abierta grande? (relleno limitado, con caché por zona). */
function onNetwork(maze: Maze, x: number, y: number, checked: Map<number, boolean>): boolean {
  const key = (tx: number, ty: number) => ty * 64 + tx;
  const known = checked.get(key(x, y));
  if (known !== undefined) return known;
  const seen = new Set<number>([key(x, y)]);
  const stack: Array<[number, number]> = [[x, y]];
  while (stack.length && seen.size < NETWORK_MIN) {
    const [cx, cy] = stack.pop()!;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      const nk = key(nx, ny);
      if (seen.has(nk) || maze.tile(nx, ny) !== Tile.Open) continue;
      seen.add(nk);
      stack.push([nx, ny]);
    }
  }
  const result = seen.size >= NETWORK_MIN;
  for (const k of seen) checked.set(k, result);
  return result;
}
