import { CONFIG } from '../../config';
import type { Ghost } from '../entities/Ghost';

export interface Foot {
  /** Posición de la punta: x e y en casillas, z en unidades de mundo. */
  x: number;
  y: number;
  z: number;
  stepping: boolean;
  /** Avance del paso (0 → 1). */
  t: number;
  stepTime: number;
  fromX: number;
  fromY: number;
  fromZ: number;
  toX: number;
  toY: number;
  /** Fantasma al que va a pisar (el pie lo persigue mientras baja). */
  target: Ghost | null;
}

/** Un pie que acaba de apoyarse: ahí se rompe el bloque y se pisotea. */
export interface FootPlant {
  x: number;
  y: number;
  stomp: boolean;
}

/** Altura del suelo bajo la punta (0 si se puede clavar; la tapa del muro si es irrompible). */
export type GroundZ = (x: number, y: number) => number;

/** Signos (±x, ±y) del reposo de cada pie; los pares diagonales (0,3) y (1,2) alternan. */
const OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];
const PAIR = [0, 1, 1, 0];

/**
 * Patas del poder GHOUL: cuatro pies que siguen al cuerpo con un paso
 * alterno por diagonales, como una araña. Un pie da un paso cuando se aleja
 * demasiado de su reposo; si un fantasma se acerca, el pie libre más cercano
 * da un pisotón rápido sobre él. Cada apoyo se devuelve como `FootPlant`.
 */
export class GhoulLegs {
  /** Última pareja diagonal que empezó a dar un paso (para turnarse). */
  private lastPair = -1;
  readonly feet: Foot[] = OFFSETS.map(() => ({
    x: 0, y: 0, z: 0, stepping: false, t: 0, stepTime: 0.2, fromX: 0, fromY: 0, fromZ: 0, toX: 0, toY: 0, target: null,
  }));

  /** Coloca los pies en su reposo alrededor del cuerpo (al aterrizar). */
  reset(bodyX: number, bodyY: number, groundZ: GroundZ): FootPlant[] {
    return this.feet.map((f, i) => {
      const [hx, hy] = this.home(i, bodyX, bodyY, 0, 0);
      Object.assign(f, { x: hx, y: hy, z: groundZ(hx, hy), stepping: false, target: null });
      return { x: hx, y: hy, stomp: false };
    });
  }

  /**
   * @param vx velocidad del cuerpo (casillas/s), para adelantar los pasos.
   * @param ghosts fantasmas que se pueden pisar.
   */
  update(dt: number, bodyX: number, bodyY: number, vx: number, vy: number, ghosts: readonly Ghost[], groundZ: GroundZ): FootPlant[] {
    const cfg = CONFIG.specialPowers.ghoul;
    const plants: FootPlant[] = [];

    // Pisotones: el pie libre más cercano va a por cada fantasma que se acerque.
    for (const g of ghosts) {
      if (g.state !== 'normal' && g.state !== 'frightened') continue;
      if ((g.x - bodyX) ** 2 + (g.y - bodyY) ** 2 > cfg.stompRange ** 2) continue;
      if (this.feet.some((f) => f.target === g)) continue;
      let best: Foot | null = null;
      let bestD = Infinity;
      for (const f of this.feet) {
        if (f.stepping) continue;
        const d = (f.x - g.x) ** 2 + (f.y - g.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      if (best) this.startStep(best, g.x, g.y, cfg.stompTime, g);
    }

    // Pasos normales: las dos parejas diagonales se turnan (cuando una acaba, le toca
    // a la otra). Un pie muy rezagado da el paso de todos modos.
    const homes = this.feet.map((_, i) => this.home(i, bodyX, bodyY, vx * cfg.stepLead, vy * cfg.stepLead));
    const gap = this.feet.map((f, i) => Math.hypot(f.x - homes[i][0], f.y - homes[i][1]));
    const needs = this.feet.map((f, i) => !f.stepping && gap[i] >= cfg.stride);
    this.feet.forEach((f, i) => {
      if (!needs[i] || f.stepping) return;
      const mine = PAIR[i];
      const otherStepping = this.feet.some((o, j) => o.stepping && PAIR[j] !== mine);
      const otherWaiting = this.feet.some((_, j) => needs[j] && PAIR[j] !== mine);
      const overdue = gap[i] > cfg.stride * 2.2;
      if (overdue || (!otherStepping && !(this.lastPair === mine && otherWaiting))) {
        this.startStep(f, homes[i][0], homes[i][1], cfg.stepTime, null);
        this.lastPair = mine;
      }
    });

    for (const f of this.feet) {
      if (!f.stepping) continue;
      if (f.target) {
        f.toX = f.target.x;
        f.toY = f.target.y;
      }
      f.t = Math.min(1, f.t + dt / f.stepTime);
      const e = f.t * f.t * (3 - 2 * f.t);
      f.x = f.fromX + (f.toX - f.fromX) * e;
      f.y = f.fromY + (f.toY - f.fromY) * e;
      const ground = groundZ(f.toX, f.toY);
      f.z = f.fromZ + (ground - f.fromZ) * e + Math.sin(f.t * Math.PI) * cfg.stepHeight;
      if (f.t >= 1) {
        f.stepping = false;
        f.z = ground;
        plants.push({ x: f.x, y: f.y, stomp: f.target !== null });
        f.target = null;
      }
    }
    return plants;
  }

  /** Reposo del pie `i`, desplazado según la velocidad y dentro del laberinto. */
  private home(i: number, bodyX: number, bodyY: number, leadX: number, leadY: number): [number, number] {
    const [ox, oy] = CONFIG.specialPowers.ghoul.footOffset;
    const x = bodyX + OFFSETS[i][0] * ox + leadX;
    const y = bodyY + OFFSETS[i][1] * oy + leadY;
    return [Math.max(0, Math.min(CONFIG.maze.width - 1, x)), y];
  }

  private startStep(f: Foot, toX: number, toY: number, time: number, target: Ghost | null): void {
    f.stepping = true;
    f.t = 0;
    f.stepTime = time;
    f.fromX = f.x;
    f.fromY = f.y;
    f.fromZ = f.z;
    f.toX = Math.max(0, Math.min(CONFIG.maze.width - 1, toX));
    f.toY = toY;
    f.target = target;
  }
}
