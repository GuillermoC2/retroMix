import { CONFIG } from '../../config';
import type { Maze } from '../maze/Maze';
import { DX, DY, Tile, type Dir } from '../maze/grid';

/** Casilla cubierta de hielo. `age` < 0 mientras el frente del disparo aún no ha llegado. */
export interface IceTile {
  x: number;
  y: number;
  age: number;
  /** Altura de la superficie del hielo (rampa que sube hasta por encima de los muros). */
  height: number;
  /** Número al azar fijo (variaciones de color y cristales en la vista). */
  seed: number;
}

/** Disparo de hielo reciente (para dibujar el rocío): desde dónde, hacia dónde y hace cuánto. */
export interface IceShot {
  x: number;
  y: number;
  dir: Dir;
  age: number;
}

/** Llamarada de este fotograma: origen (boca), dirección y alcance actual. */
export interface Flame {
  x: number;
  y: number;
  dir: Dir;
  reach: number;
  /** Bloques que la llamarada alcanza (se queman). */
  walls: Array<{ x: number; y: number }>;
  /** Casillas de pasillo que alcanza (se queman sus puntos). */
  open: Array<{ x: number; y: number }>;
}

/** Distancia (casillas) del centro del protagonista a su boca. */
const MOUTH = 0.3;
const key = (x: number, y: number) => y * 64 + x;

/**
 * Poder FUEGO HIELO.
 *
 * Hielo (Z): dispara una cuña de hielo hacia donde mira, estrecha junto a la boca
 * y ancha al final, que sube como una rampa desde el suelo hasta por encima de los
 * muros. El frente avanza deprisa y va cubriendo las casillas (también los bloques,
 * que quedan dentro del hielo). El hielo dura unos segundos: come los puntos que
 * cubre, mata a los fantasmas que lo pisan y el protagonista se desliza sobre él
 * más rápido, también por encima de los muros que cubre.
 *
 * Fuego (X): una llamarada que sale de la boca y le sigue mientras dura. Su frente
 * avanza hasta su largo; quema los bloques, los fantasmas y los puntos que alcanza.
 *
 * Ni el hielo ni el fuego atraviesan un muro portal ni tocan el borde exterior.
 */
export class FireIce {
  readonly ice = new Map<number, IceTile>();
  shot: IceShot | null = null;
  iceCooldown = 0;
  fireCooldown = 0;
  /** Tiempo que lleva la llamarada en curso (null si no hay). */
  private flameAge: number | null = null;

  get iceReady(): boolean {
    return this.iceCooldown <= 0;
  }

  get fireReady(): boolean {
    return this.fireCooldown <= 0;
  }

  get flaming(): boolean {
    return this.flameAge !== null;
  }

  /** Dispara una cuña de hielo desde (x, y) hacia `dir`. @returns si se ha disparado. */
  tryIce(maze: Maze, x: number, y: number, dir: Dir): boolean {
    if (!this.iceReady) return false;
    const cfg = CONFIG.specialPowers.fireIce.ice;
    this.iceCooldown = cfg.cooldown;
    this.shot = { x, y, dir, age: 0 };
    const top = CONFIG.maze.wallDepth + cfg.overWalls;
    for (const t of cone(maze, x, y, dir, cfg.length, cfg.halfWidth, cfg.length)) {
      const delay = Math.max(0, t.along) / cfg.speed;
      // Rampa: sube desde el suelo hasta lo alto; sobre un bloque, siempre por encima de él.
      const ramp = cfg.floor + (top - cfg.floor) * Math.max(0, Math.min(1, t.along / cfg.ramp));
      const height = maze.tile(t.x, t.y) === Tile.Wall ? top : ramp;
      const prev = this.ice.get(key(t.x, t.y));
      // Una casilla que ya tenía hielo se renueva (sin volver a esperar al frente).
      if (prev) {
        prev.age = prev.age >= 0 ? 0 : Math.max(prev.age, -delay);
        prev.height = Math.max(prev.height, height);
      } else this.ice.set(key(t.x, t.y), { x: t.x, y: t.y, age: -delay, height, seed: Math.floor(Math.random() * 1000) });
    }
    return true;
  }

  /** Empieza una llamarada. @returns si ha empezado. */
  tryFire(): boolean {
    if (!this.fireReady) return false;
    this.fireCooldown = CONFIG.specialPowers.fireIce.fire.cooldown;
    this.flameAge = 0;
    return true;
  }

  /**
   * Avanza el tiempo: recargas, hielo (aparece al llegar el frente y se derrite) y
   * llamarada. Quita el hielo que ha caído bajo la lava.
   * @returns las casillas de hielo que acaban de cuajar (para comer sus puntos).
   */
  update(dt: number, lavaY: number): IceTile[] {
    const { ice, fire } = CONFIG.specialPowers.fireIce;
    this.iceCooldown = Math.max(0, this.iceCooldown - dt);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.shot && (this.shot.age += dt) > ice.length / ice.speed + 0.15) this.shot = null;
    if (this.flameAge !== null && (this.flameAge += dt) >= fire.time) this.flameAge = null;
    const set: IceTile[] = [];
    for (const [k, t] of this.ice) {
      const before = t.age;
      t.age += dt;
      if (before < 0 && t.age >= 0) set.push(t);
      if (t.age >= ice.life || t.y < lavaY - 2) this.ice.delete(k);
    }
    return set;
  }

  /** ¿Hay hielo cuajado en la casilla? */
  iceAt(x: number, y: number): boolean {
    const t = this.ice.get(key(x, y));
    return !!t && t.age >= 0;
  }

  /**
   * Altura de la superficie del hielo en la casilla (null si no hay hielo cuajado).
   * Al derretirse baja en escalones; sobre un bloque no baja de su tapa.
   */
  surface(x: number, y: number, onWall: boolean): number | null {
    const t = this.ice.get(key(x, y));
    if (!t || t.age < 0) return null;
    const { life, melt } = CONFIG.specialPowers.fireIce.ice;
    const left = life - t.age;
    const m = left < melt ? Math.ceil((left / melt) * 4) / 4 : 1;
    const depth = CONFIG.maze.wallDepth;
    return onWall ? depth + (Math.max(t.height, depth) - depth) * m : t.height * m;
  }

  /** Llamarada de este fotograma desde la boca de quien está en (x, y) mirando a `dir` (null si no hay). */
  flame(maze: Maze, x: number, y: number, dir: Dir): Flame | null {
    if (this.flameAge === null) return null;
    const cfg = CONFIG.specialPowers.fireIce.fire;
    const reach = Math.min(cfg.length, this.flameAge * cfg.speed);
    const walls: Flame['walls'] = [];
    const open: Flame['open'] = [];
    const mx = x + DX[dir] * MOUTH;
    const my = y + DY[dir] * MOUTH;
    for (const t of cone(maze, mx, my, dir, cfg.length, cfg.halfWidth, reach)) {
      const tile = maze.tile(t.x, t.y);
      if (tile === Tile.Wall) walls.push({ x: t.x, y: t.y });
      else if (tile === Tile.Open) open.push({ x: t.x, y: t.y });
    }
    return { x: mx, y: my, dir, reach, walls, open };
  }

  /** ¿El punto (px, py) está dentro de la llamarada (con `margin` de holgura)? */
  inFlame(f: Flame, px: number, py: number, margin: number): boolean {
    const { halfWidth, length } = CONFIG.specialPowers.fireIce.fire;
    return inCone(f.x, f.y, f.dir, length, halfWidth, f.reach, px, py, margin);
  }

  clear(): void {
    this.ice.clear();
    this.shot = null;
    this.flameAge = null;
    this.iceCooldown = 0;
    this.fireCooldown = 0;
  }
}

/** ¿(px, py) está en la cuña que sale de (ox, oy) hacia `dir`, hasta `reach`? */
function inCone(ox: number, oy: number, dir: Dir, length: number, halfWidth: readonly [number, number], reach: number, px: number, py: number, margin = 0): boolean {
  const dx = DX[dir];
  const dy = DY[dir];
  const ax = px - ox;
  const ay = py - oy;
  const along = ax * dx + ay * dy;
  if (along < -0.5 - margin || along > reach + margin) return false;
  const perp = Math.abs(ax * dy - ay * dx);
  const [w0, w1] = halfWidth;
  const w = w0 + (w1 - w0) * Math.max(0, Math.min(1, along / length));
  return perp <= w + margin;
}

/**
 * Casillas de la cuña (sin el borde exterior, sin muros portal y sin lo que
 * queda detrás de un muro portal), con su distancia a lo largo del eje.
 */
function cone(
  maze: Maze,
  ox: number,
  oy: number,
  dir: Dir,
  length: number,
  halfWidth: readonly [number, number],
  reach: number,
): Array<{ x: number; y: number; along: number }> {
  const out: Array<{ x: number; y: number; along: number }> = [];
  const r = Math.ceil(Math.max(length, halfWidth[1]) + 1);
  const cx = Math.round(ox);
  const cy = Math.round(oy);
  for (let ty = cy - r; ty <= cy + r; ty++) {
    for (let tx = Math.max(1, cx - r); tx <= Math.min(maze.width - 2, cx + r); tx++) {
      if (!inCone(ox, oy, dir, length, halfWidth, reach, tx, ty)) continue;
      const tile = maze.tile(tx, ty);
      if (tile === undefined || tile === Tile.Gate || behindGate(maze, cy, ty)) continue;
      out.push({ x: tx, y: ty, along: (tx - ox) * DX[dir] + (ty - oy) * DY[dir] });
    }
  }
  return out;
}

/** ¿Hay un muro portal (van de lado a lado) entre la fila `from` y la fila `to`? */
function behindGate(maze: Maze, from: number, to: number): boolean {
  const step = Math.sign(to - from);
  for (let y = from + step; step && y !== to; y += step) if (maze.tile(1, y) === Tile.Gate) return true;
  return false;
}
