import { CONFIG, type MazeStyle } from '../../config';
import { Rng } from '../../core/Rng';
import { Tile } from './grid';

/**
 * Generador procedural del laberinto vertical infinito.
 *
 * Modelo (inspirado en la estructura de los laberintos arcade clásicos):
 *  - Los pasillos forman una retícula: columnas fijas (`corridorColumns`) y
 *    "líneas" horizontales separadas por filas de bloques de 2 o 3 casillas.
 *  - Entre pasillos hay bloques de pared. Cerrar un tramo de pasillo fusiona los
 *    dos bloques que separa en una pieza de pared mayor (L, T, barras...).
 *  - Las piezas se gestionan con conjuntos disjuntos. Nunca se permite un cierre
 *    que forme un ciclo de paredes ni que una el borde izquierdo con el derecho:
 *    eso garantiza que todos los pasillos están conectados y que SIEMPRE existe
 *    un camino hacia arriba.
 *  - Cada sección elige un estilo (simétrico, retorcido, abierto...) para variar.
 *  - Cada `portals.every` metros se abre una sala amplia con un portal en el
 *    centro: dos filas de bloques (y sus tres líneas) se vacían entre dos columnas
 *    de pasillo. Vaciar solo abre casillas, así que la conectividad se mantiene.
 *  - Cada 100–150 m (más 20 m por cada muro anterior, `CONFIG.gates`), un muro portal: una fila de bloques entera pasa a
 *    ser `Tile.Gate` (barrera de lado a lado) y las líneas de debajo y de encima
 *    se abren de lado a lado. Así, todo lo de debajo sigue conectado entre sí por
 *    la línea inferior y todo lo de encima por la superior.
 */

const LEFT = -1;
const RIGHT = -2;

interface PieceSet {
  id: number;
  members: number[];
  /** Columnas de bloque que ocupa la pieza (para limitar su anchura). */
  minC: number;
  maxC: number;
  /** 0 = pieza interior, 1 = unida al borde izquierdo, 2 = al derecho. */
  border: 0 | 1 | 2;
}

interface MergeUndo {
  into: number;
  from: PieceSet;
  prevMinC: number;
  prevMaxC: number;
}

/** Conjuntos disjuntos de bloques con posibilidad de deshacer (para probar cierres simétricos). */
class Pieces {
  constructor(private blocksPerRow: number) {}

  private setOf = new Map<number, number>();
  private sets = new Map<number, PieceSet>([
    [LEFT, { id: LEFT, members: [], minC: 0, maxC: 0, border: 1 }],
    [RIGHT, { id: RIGHT, members: [], minC: 0, maxC: 0, border: 2 }],
  ]);

  add(block: number): void {
    this.setOf.set(block, block);
    const c = block % this.blocksPerRow;
    this.sets.set(block, { id: block, members: [block], minC: c, maxC: c, border: 0 });
  }

  private setFor(node: number): PieceSet {
    return this.sets.get(node < 0 ? node : this.setOf.get(node)!)!;
  }

  canMerge(p: number, q: number, style: MazeStyle): boolean {
    const a = this.setFor(p);
    const b = this.setFor(q);
    if (a === b) return false;
    if (p < 0 || q < 0) {
      const blockSet = p < 0 ? b : a;
      return blockSet.border === 0 && blockSet.members.length <= style.maxBorderPiece;
    }
    // Las piezas unidas al borde quedan bloqueadas para no crecer indefinidamente.
    if (a.border || b.border) return false;
    const span = Math.max(a.maxC, b.maxC) - Math.min(a.minC, b.minC) + 1;
    return a.members.length + b.members.length <= style.maxPiece && span <= style.maxSpan;
  }

  merge(p: number, q: number): MergeUndo {
    let into = this.setFor(p);
    let from = this.setFor(q);
    if (from.border || (!into.border && into.members.length < from.members.length)) [into, from] = [from, into];
    const undo: MergeUndo = { into: into.id, from, prevMinC: into.minC, prevMaxC: into.maxC };
    for (const m of from.members) this.setOf.set(m, into.id);
    into.members.push(...from.members);
    into.minC = Math.min(into.minC, from.minC);
    into.maxC = Math.max(into.maxC, from.maxC);
    this.sets.delete(from.id);
    return undo;
  }

  undo(u: MergeUndo): void {
    const into = this.sets.get(u.into)!;
    into.members.splice(into.members.length - u.from.members.length);
    into.minC = u.prevMinC;
    into.maxC = u.prevMaxC;
    for (const m of u.from.members) this.setOf.set(m, u.from.id);
    this.sets.set(u.from.id, u.from);
  }

  /** Libera bloques de filas que ya no se usarán (las piezas antiguas no afectan a las nuevas). */
  forgetBelow(minBlock: number): void {
    for (const [block] of this.setOf) {
      if (block < minBlock) this.setOf.delete(block);
    }
    for (const [id, set] of this.sets) {
      set.members = set.members.filter((m) => m >= minBlock);
      if (id >= 0 && set.members.length === 0) this.sets.delete(id);
    }
  }
}

type Edge = { kind: 'v'; row: number; i: number } | { kind: 'h'; row: number; c: number };

export interface GeneratedChunk {
  index: number;
  /** Primera fila (y) de la sección. */
  yStart: number;
  /** Filas de casillas, de abajo a arriba. rows[0] corresponde a yStart. */
  rows: Uint8Array[];
  energizers: Array<{ x: number; y: number }>;
  /** Portales (centro de una sala) que caen en esta sección. */
  portals: Array<{ x: number; y: number }>;
  /** Muros portal (primera y última fila de la barrera) que caen en esta sección. */
  gates: Array<{ y0: number; y1: number }>;
  style: string;
}

/**
 * Sala del portal: filas de bloques r0 y r0+1 (de 3 casillas) y sus tres líneas,
 * vaciadas entre las columnas x0 y x1. Ocupa de la fila y0 a la y0 + 8.
 */
interface Plaza {
  r0: number;
  y0: number;
  x0: number;
  x1: number;
}
const PLAZA_ROWS = 9;

/** Muro portal: la fila de bloques r se convierte en barrera; las líneas r y r+1 se abren de lado a lado. */
interface GateRow {
  r: number;
}

export class MazeGenerator {
  readonly width = CONFIG.maze.width;
  private readonly cols = CONFIG.maze.corridorColumns;
  /** Número de columnas de pasillo (NC) y de bloques (NB = NC - 1). */
  private readonly nc = this.cols.length;
  private readonly nb = this.cols.length - 1;

  private pieces = new Pieces(this.nb);
  /** Tramos verticales cerrados por fila de bloques: vClosed[r][i]. */
  private vClosed: boolean[][] = [];
  /** Tramos horizontales cerrados por línea: hClosed[r][c]. */
  private hClosed: boolean[][] = [];
  /** Y de cada línea horizontal de pasillos. */
  private lineY: number[] = [];
  private nextBlockRow = 0;
  private forgottenRows = 0;
  private nextChunk = 0;
  private style!: MazeStyle;
  /** Sala del portal más reciente (la que se está vaciando) y fila a partir de la cual toca la siguiente. */
  private plaza: Plaza | null = null;
  private nextPlazaY: number;
  /** Muro portal más reciente. */
  private gate: GateRow | null = null;
  /** Filas a partir de las cuales toca cada muro (se van calculando según hacen falta) y el siguiente por colocar. */
  private gateYs: number[] = [];
  private nextGate = 0;
  /** Azar propio de la separación entre muros (las salas consultan muros futuros sin alterar el laberinto). */
  private gateRng: Rng;

  constructor(private rng: Rng = new Rng()) {
    this.lineY[0] = 1;
    this.gateRng = new Rng(rng.int(0, 2 ** 31));
    this.nextPlazaY = this.awayFromGates(CONFIG.player.startRow + CONFIG.portals.firstAt / CONFIG.scoring.metersPerRow);
  }

  /** Fila a partir de la cual va el muro `k` (0 = el primero). */
  private gateY(k: number): number {
    const { gap, growth } = CONFIG.gates;
    while (this.gateYs.length <= k) {
      const i = this.gateYs.length;
      const prev = i === 0 ? CONFIG.player.startRow : this.gateYs[i - 1];
      const meters = this.gateRng.int(gap[0], gap[1]) + i * growth;
      this.gateYs.push(prev + Math.round(meters / CONFIG.scoring.metersPerRow));
    }
    return this.gateYs[k];
  }

  /** Genera la siguiente sección del laberinto (hacia arriba). */
  nextChunkData(): GeneratedChunk {
    const index = this.nextChunk++;
    // La primera sección usa siempre el estilo clásico para un arranque reconocible.
    this.style = index === 0 ? CONFIG.maze.styles[0] : this.rng.weighted(CONFIG.maze.styles);
    const rows: Uint8Array[] = [];
    let yStart = this.lineY[this.nextBlockRow];

    if (index === 0) {
      rows.push(new Uint8Array(this.width).fill(Tile.Wall)); // suelo en y = 0
      yStart = 0;
    }

    const portals: Array<{ x: number; y: number }> = [];
    const gates: Array<{ y0: number; y1: number }> = [];
    for (let n = 0; n < CONFIG.maze.blockRowsPerChunk; n++) {
      const r = this.nextBlockRow++;
      const isGate = index > 0 && this.lineY[r] >= this.gateY(this.nextGate);
      if (isGate) {
        this.gate = { r };
        gates.push({ y0: this.lineY[r] + 1, y1: this.lineY[r] + CONFIG.gates.rows });
        // El muro cae en la primera línea a partir de su fila prevista: los siguientes se miden desde donde ha caído.
        const drift = this.lineY[r] - this.gateY(this.nextGate);
        for (let k = this.nextGate; k < this.gateYs.length; k++) this.gateYs[k] += drift;
        this.nextGate++;
      } else if (index > 0 && this.lineY[r] >= this.nextPlazaY && n <= CONFIG.maze.blockRowsPerChunk - 2) {
        // Sala del portal: sus dos filas de bloques caen en la misma sección (el portal también).
        const [c0, c1] = CONFIG.portals.plazaColumns;
        this.plaza = { r0: r, y0: this.lineY[r], x0: this.cols[c0], x1: this.cols[c1] };
        portals.push({ x: (this.width - 1) / 2, y: this.lineY[r] + (PLAZA_ROWS - 1) / 2 });
        this.nextPlazaY = this.awayFromGates(this.nextPlazaY + CONFIG.portals.every / CONFIG.scoring.metersPerRow);
      }
      const inPlaza = this.plaza !== null && r - this.plaza.r0 <= 1;
      const height = isGate ? CONFIG.gates.rows : inPlaza || this.rng.chance(this.style.tallRowChance) ? 3 : 2;
      this.lineY[r + 1] = this.lineY[r] + height + 1;
      for (let c = 0; c < this.nb; c++) this.pieces.add(this.blockId(r, c));
      this.vClosed[r] = new Array(this.nc).fill(false);
      this.hClosed[r] = new Array(this.nb).fill(false);
      this.decideRow(r);
      rows.push(this.lineRow(r));
      for (let k = 0; k < height; k++) rows.push(this.blockRowTiles(r));
    }

    // Liberar estado de filas antiguas que ya no influyen.
    const keep = this.nextBlockRow - 3;
    if (keep > this.forgottenRows) {
      this.pieces.forgetBelow(this.blockId(keep, 0));
      for (; this.forgottenRows < keep; this.forgottenRows++) {
        delete this.vClosed[this.forgottenRows];
        delete this.hClosed[this.forgottenRows];
        delete this.lineY[this.forgottenRows];
      }
    }

    const chunk: GeneratedChunk = { index, yStart, rows, energizers: [], portals, gates, style: this.style.name };
    chunk.energizers = this.placeEnergizers(chunk);
    return chunk;
  }

  /** Si la fila `y` queda demasiado cerca de un muro portal, la lleva justo después de él (para salas con portal). */
  private awayFromGates(y: number): number {
    const { plazaClearance } = CONFIG.gates;
    for (let k = 0; ; k++) {
      const gateY = this.gateY(k);
      if (gateY > y + plazaClearance) return y;
      if (Math.abs(y - gateY) < plazaClearance) return gateY + plazaClearance;
    }
  }

  private blockId(r: number, c: number): number {
    return r * this.nb + c;
  }

  // ---------------------------------------------------------------------------
  // Decisión de tramos abiertos/cerrados
  // ---------------------------------------------------------------------------

  private decideRow(r: number): void {
    const s = this.style;
    const edges: Edge[][] = [];
    const canonical = (n: number, isV: boolean) => !s.symmetric || n <= (isV ? this.nc - 1 - n : this.nb - 1 - n);

    if (r > 0) {
      for (let c = 0; c < this.nb; c++) {
        if (!canonical(c, false)) continue;
        const e: Edge = { kind: 'h', row: r, c };
        edges.push(s.symmetric ? this.withMirror(e) : [e]);
      }
    }
    for (let i = 0; i < this.nc; i++) {
      if (!canonical(i, true)) continue;
      const e: Edge = { kind: 'v', row: r, i };
      edges.push(s.symmetric ? this.withMirror(e) : [e]);
    }

    for (const group of this.rng.shuffle(edges)) {
      if (this.rng.chance(s.mergeChance)) this.tryClose(group);
    }

    // Evitar líneas horizontales completamente abiertas: se ven repetitivas y no plantean decisiones.
    if (r > 0 && !this.hClosed[r].some(Boolean)) {
      for (const group of edges.filter((g) => g[0].kind === 'h')) {
        this.tryClose(group);
        if (this.hClosed[r].some(Boolean)) break;
      }
    }
  }

  private withMirror(e: Edge): Edge[] {
    const m: Edge = e.kind === 'v' ? { ...e, i: this.nc - 1 - e.i } : { ...e, c: this.nb - 1 - e.c };
    const same = e.kind === 'v' ? m.kind === 'v' && m.i === e.i : m.kind === 'h' && m.c === e.c;
    return same ? [e] : [e, m];
  }

  private edgeNodes(e: Edge): [number, number] {
    if (e.kind === 'h') return [this.blockId(e.row - 1, e.c), this.blockId(e.row, e.c)];
    const p = e.i === 0 ? LEFT : this.blockId(e.row, e.i - 1);
    const q = e.i === this.nc - 1 ? RIGHT : this.blockId(e.row, e.i);
    return [p, q];
  }

  private setClosed(e: Edge, closed: boolean): void {
    if (e.kind === 'v') this.vClosed[e.row][e.i] = closed;
    else this.hClosed[e.row][e.c] = closed;
  }

  /** Intenta cerrar un grupo de tramos (uno, o dos si es simétrico) de forma atómica. */
  private tryClose(group: Edge[]): void {
    const undos: MergeUndo[] = [];
    const revert = () => {
      undos.reverse().forEach((u) => this.pieces.undo(u));
      group.forEach((e) => this.setClosed(e, false));
    };

    for (const e of group) {
      const [p, q] = this.edgeNodes(e);
      if (!this.pieces.canMerge(p, q, this.style)) return revert();
      undos.push(this.pieces.merge(p, q));
      this.setClosed(e, true);
    }

    // Cerrar puede dejar una intersección con una sola salida: callejón sin salida.
    let minDegree = Infinity;
    for (const e of group) {
      for (const [i, line] of this.edgeVertices(e)) minDegree = Math.min(minDegree, this.degree(i, line));
    }
    if (minDegree === 0 || (minDegree === 1 && !this.rng.chance(this.style.deadEndChance))) revert();
  }

  private edgeVertices(e: Edge): Array<[number, number]> {
    return e.kind === 'v'
      ? [[e.i, e.row], [e.i, e.row + 1]]
      : [[e.c, e.row], [e.c + 1, e.row]];
  }

  /** Salidas abiertas de la intersección (columna de pasillo i, línea r). Lo no decidido cuenta como abierto. */
  private degree(i: number, r: number): number {
    let n = 0;
    if (!this.vClosed[r]?.[i]) n++; // arriba
    if (r > 0 && !this.vClosed[r - 1]?.[i]) n++; // abajo
    if (i > 0 && !this.hClosed[r]?.[i - 1]) n++; // izquierda
    if (i < this.nc - 1 && !this.hClosed[r]?.[i]) n++; // derecha
    return n;
  }

  // ---------------------------------------------------------------------------
  // Conversión a casillas
  // ---------------------------------------------------------------------------

  private lineRow(r: number): Uint8Array {
    const row = new Uint8Array(this.width).fill(Tile.Wall);
    for (let i = 0; i < this.nc; i++) {
      row[this.cols[i]] = this.degree(i, r) > 0 ? Tile.Open : Tile.Wall;
    }
    for (let c = 0; c < this.nb; c++) {
      if (r > 0 && this.hClosed[r][c]) continue;
      for (let x = this.cols[c] + 1; x < this.cols[c + 1]; x++) row[x] = Tile.Open;
    }
    // Las tres líneas de la sala (abajo, centro y arriba) quedan abiertas de lado a lado.
    if (this.plaza && r >= this.plaza.r0 && r - this.plaza.r0 <= 2) this.carve(row, this.plaza);
    // Líneas a ambos lados del muro portal: abiertas de lado a lado.
    if (this.gate && (r === this.gate.r || r === this.gate.r + 1)) row.fill(Tile.Open, 1, this.width - 1);
    return row;
  }

  private blockRowTiles(r: number): Uint8Array {
    const row = new Uint8Array(this.width).fill(Tile.Wall);
    for (let i = 0; i < this.nc; i++) {
      if (!this.vClosed[r][i]) row[this.cols[i]] = Tile.Open;
    }
    if (this.plaza && r >= this.plaza.r0 && r - this.plaza.r0 <= 1) this.carve(row, this.plaza);
    if (this.gate?.r === r) row.fill(Tile.Gate, 1, this.width - 1);
    return row;
  }

  private carve(row: Uint8Array, plaza: Plaza): void {
    for (let x = plaza.x0; x <= plaza.x1; x++) row[x] = Tile.Open;
  }

  /** ¿La casilla está dentro de la sala del portal más reciente? (ahí no van energizadores). */
  private inPlaza(x: number, y: number): boolean {
    const p = this.plaza;
    return !!p && x >= p.x0 && x <= p.x1 && y >= p.y0 && y < p.y0 + PLAZA_ROWS;
  }

  // ---------------------------------------------------------------------------
  // Energizadores
  // ---------------------------------------------------------------------------

  private placeEnergizers(chunk: GeneratedChunk): Array<{ x: number; y: number }> {
    const { rows, yStart } = chunk;
    const open = (x: number, k: number) => rows[k]?.[x] === Tile.Open;
    const deadEnds: Array<{ x: number; y: number }> = [];
    const candidates: Array<{ x: number; y: number }> = [];
    const minK = chunk.index === 0 ? 8 : 1; // nada de energizadores pegados a la salida

    for (let k = minK; k < rows.length - 1; k++) {
      for (let x = 0; x < this.width; x++) {
        if (!open(x, k) || this.inPlaza(x, yStart + k)) continue;
        const exits = +open(x - 1, k) + +open(x + 1, k) + +open(x, k - 1) + +open(x, k + 1);
        const tile = { x, y: yStart + k };
        if (exits === 1) deadEnds.push(tile);
        else if (exits >= 3) candidates.push(tile);
      }
    }

    const { energizersPerChunk, extraEnergizerChance, deadEndPreference } = CONFIG.pellets;
    const count = energizersPerChunk + (this.rng.chance(extraEnergizerChance) ? 1 : 0);
    const placed: Array<{ x: number; y: number }> = [];
    for (let n = 0; n < count; n++) {
      const pool = deadEnds.length && this.rng.chance(deadEndPreference) ? deadEnds : candidates;
      const far = pool.filter((t) => placed.every((p) => Math.abs(p.x - t.x) + Math.abs(p.y - t.y) > 8));
      if (!far.length) break;
      placed.push(this.rng.pick(far));
    }
    return placed;
  }
}
