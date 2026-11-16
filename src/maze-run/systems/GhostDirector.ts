import { CONFIG } from '../../config';
import type { Rng } from '../../core/Rng';
import { Ghost, PERSONALITIES, type GhostBrainContext, type GhostPersonality } from '../entities/Ghost';
import type { Player } from '../entities/Player';
import { DistanceField } from '../maze/DistanceField';
import type { Maze } from '../maze/Maze';
import { DX, DY, type Dir } from '../maze/grid';
import { frightDuration, ghostCount, ghostSpeed } from './difficulty';

const SPAWN_TIME = 0.7;
/** Orden de desempate clásico: arriba, izquierda, abajo, derecha. */
const TIE_ORDER: Dir[] = [0, 3, 2, 1];

export interface GhostHit {
  ghost: Ghost;
  score: number;
}

/**
 * Gestiona la población de fantasmas: cuántos hay según la distancia, dónde
 * aparecen, el ciclo dispersión/persecución, el modo asustado y cómo decide
 * cada uno su camino.
 */
export class GhostDirector {
  readonly ghosts: Ghost[] = [];
  private modeTimer = 0;
  scatter = true;
  frightTimer = 0;
  /**
   * Congelación (cubito de hielo): mientras dura, los fantasmas no se mueven ni
   * matan. Se pueden comer igual que sin congelar (asustados, con un poder
   * especial o con el láser). El susto y el ciclo dispersión/persecución se
   * detienen y siguen al descongelarse. Los ojos (comidos) siguen volviendo a casa.
   */
  freezeTimer = 0;
  private eatCombo = 0;
  /** Fantasmas que estaban apareciendo al asustar con `includeSpawning`: al terminar de aparecer salen asustados. */
  private frightOnSpawn = new Set<Ghost>();
  private spawnCooldown = 0;
  private playerField = new DistanceField();
  private fieldAge = Infinity;
  private homeFields = new Map<Ghost, DistanceField>();
  /** Fantasmas eliminados por la lava en el último update (para efectos). */
  readonly burned: Ghost[] = [];
  /** FANTASMA AMIGO: el aliado (si hay) y los segundos que le quedan. */
  ally: Ghost | null = null;
  allyTimer = 0;
  /** Se cogió un corazón sin fantasmas cerca: el primero que termine de aparecer será el aliado. */
  private allyPending = false;
  /** Fantasmas que se ha comido el aliado en el último update (para los puntos). */
  readonly allyHits: GhostHit[] = [];

  constructor(
    private maze: Maze,
    private rng: Rng,
  ) {}

  get frightened(): boolean {
    return this.frightTimer > 0;
  }

  get frozen(): boolean {
    return this.freezeTimer > 0;
  }

  /** Congela a todos los fantasmas (y a los que aparezcan mientras dura). */
  freeze(duration: number): void {
    this.freezeTimer = Math.max(this.freezeTimer, duration);
  }

  /** Termina la congelación de golpe (p. ej. al recibir un poder especial). */
  unfreeze(): void {
    this.freezeTimer = 0;
  }

  update(dt: number, player: Player, meters: number, lavaY: number, speedMultiplier: number): void {
    const frozen = this.frozen;
    if (frozen) this.freezeTimer = Math.max(0, this.freezeTimer - dt);
    else this.updateModes(dt);
    this.updatePlayerField(dt, player, lavaY);
    this.burned.length = 0;
    this.allyHits.length = 0;
    if (this.allyTimer > 0) {
      this.allyTimer = Math.max(0, this.allyTimer - dt);
      if (this.allyTimer === 0) {
        this.allyPending = false;
        this.dismissAlly(player);
      }
    }

    const ctx: GhostBrainContext = {
      maze: this.maze,
      player,
      playerField: this.playerField,
      leader: this.ghosts.find((g) => g.personality.id === 'perseguidor' && g.state === 'normal'),
      scatter: this.scatter,
    };
    const blocked = (_x: number, y: number) => y < lavaY + 0.6;

    for (const g of [...this.ghosts]) {
      g.stateTime += dt;
      switch (g.state) {
        case 'spawning':
          if (g.stateTime >= SPAWN_TIME) {
            const scared = this.frightOnSpawn.has(g) && this.frightTimer > 0;
            this.frightOnSpawn.delete(g);
            if (this.allyPending) this.makeAlly(g);
            else g.setState(scared ? 'frightened' : 'normal');
          }
          break;
        case 'ally':
          // El aliado no se congela: va a por el fantasma más cercano (o se queda cerca del jugador).
          g.move(ghostSpeed(meters) * speedMultiplier * CONFIG.abilities.friend.speed * dt, this.maze, (opts) => this.chooseAlly(g, opts, player), blocked);
          this.allyBite(g, player);
          break;
        case 'normal':
          if (frozen) break;
          g.move(ghostSpeed(meters) * speedMultiplier * dt, this.maze, (opts) => this.chooseNormal(g, opts, ctx), blocked);
          break;
        case 'frightened':
          if (frozen) break;
          g.move(CONFIG.ghosts.frightenedSpeed * dt, this.maze, (opts) => this.rng.pick(opts), blocked);
          break;
        case 'eaten':
          g.move(CONFIG.ghosts.eyesSpeed * dt, this.maze, (opts) => this.chooseHome(g, opts), () => false);
          if (g.home && g.tileX === g.home.x && g.tileY === g.home.y) {
            this.homeFields.delete(g);
            g.setState('spawning');
          }
          break;
      }

      const outOfMaze = !this.maze.hasRow(g.tileY);
      if ((g.state !== 'eaten' && g.y < lavaY) || outOfMaze) {
        this.remove(g);
        if (!outOfMaze) this.burned.push(g);
      }
    }

    this.spawnCooldown -= dt;
    if (this.spawnCooldown <= 0 && this.ghosts.length < ghostCount(meters)) {
      if (this.spawn(player)) this.spawnCooldown = CONFIG.ghosts.spawnCooldown;
    }
  }

  /**
   * Asusta a todos los fantasmas activos.
   * @param bonus segundos extra (habilidades compradas, p. ej. SUSTO LARGO).
   * @param includeSpawning los que están apareciendo también salen asustados (al abrir un muro
   * portal; con un energizador, como en el clásico, salen normales).
   */
  frighten(meters: number, bonus = 0, includeSpawning = false): number {
    const duration = frightDuration(meters) + bonus;
    this.frightTimer = duration;
    this.eatCombo = 0;
    this.frightOnSpawn.clear();
    for (const g of this.ghosts) {
      if (g.state === 'normal' || g.state === 'frightened') g.setState('frightened');
      else if (includeSpawning && g.state === 'spawning') this.frightOnSpawn.add(g);
    }
    return duration;
  }

  /**
   * FANTASMA AMIGO: el fantasma activo más cercano al jugador pasa a ser aliado
   * durante `duration` s. Si no hay ninguno, lo será el primero que aparezca.
   * @returns el nuevo aliado, o null si queda pendiente.
   */
  befriend(player: Player, duration: number): Ghost | null {
    this.dismissAlly(player);
    this.allyTimer = duration;
    this.eatCombo = 0;
    let best: Ghost | null = null;
    let bestD = Infinity;
    for (const g of this.ghosts) {
      if (g.state !== 'normal' && g.state !== 'frightened') continue;
      const d = (g.x - player.x) ** 2 + (g.y - player.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    if (best) this.makeAlly(best);
    else this.allyPending = true;
    return best;
  }

  /** Termina el aliado: se convierte en ojos y vuelve a una casa por delante del jugador. */
  dismissAlly(player: Player): void {
    this.allyPending = false;
    const g = this.ally;
    this.ally = null;
    if (!g || g.state !== 'ally') return;
    g.home = this.pickSpawnTile(player) ?? { x: g.tileX, y: g.tileY };
    g.setState('eaten');
  }

  private makeAlly(g: Ghost): void {
    this.allyPending = false;
    this.frightOnSpawn.delete(g);
    this.ally = g;
    g.setState('ally');
  }

  /** El aliado se come a los fantasmas activos que toca. */
  private allyBite(ally: Ghost, player: Player): void {
    const r2 = CONFIG.ghosts.hitRadius ** 2;
    const scores = CONFIG.ghosts.eatScores;
    for (const g of this.ghosts) {
      if (g.state !== 'normal' && g.state !== 'frightened') continue;
      if ((g.x - ally.x) ** 2 + (g.y - ally.y) ** 2 > r2) continue;
      this.allyHits.push({ ghost: g, score: scores[Math.min(this.eatCombo++, scores.length - 1)] });
      g.home = this.pickSpawnTile(player) ?? { x: g.tileX, y: g.tileY };
      g.setState('eaten');
    }
  }

  /** Dirección del aliado: hacia el fantasma activo más cercano; si no hay, hacia el jugador. */
  private chooseAlly(ally: Ghost, options: Dir[], player: Player): Dir {
    let tx = player.tileX;
    let ty = player.tileY;
    let bestD = Infinity;
    for (const g of this.ghosts) {
      if (g.state !== 'normal' && g.state !== 'frightened') continue;
      const d = (g.x - ally.x) ** 2 + (g.y - ally.y) ** 2;
      if (d < bestD) {
        bestD = d;
        tx = g.tileX;
        ty = g.tileY;
      }
    }
    return this.bestBy(options, (d) => this.euclid(ally, d, tx, ty))!;
  }

  /** Colisiones con el jugador: devuelve si el jugador muere y qué fantasmas se ha comido. */
  checkPlayer(player: Player): { killed: boolean; eaten: GhostHit[] } {
    const eaten: GhostHit[] = [];
    let killed = false;
    const r2 = CONFIG.ghosts.hitRadius ** 2;
    for (const g of this.ghosts) {
      if ((g.x - player.x) ** 2 + (g.y - player.y) ** 2 > r2) continue;
      if (g.state === 'normal') killed ||= !this.frozen;
      else if (g.state === 'frightened') {
        const scores = CONFIG.ghosts.eatScores;
        eaten.push({ ghost: g, score: scores[Math.min(this.eatCombo++, scores.length - 1)] });
        g.home = this.pickSpawnTile(player) ?? { x: g.tileX, y: g.tileY };
        g.setState('eaten');
      }
    }
    return { killed: killed && eaten.length === 0, eaten };
  }

  /**
   * Se come a todos los fantasmas (asustados o no) a menos de `radius` del
   * jugador. Lo usa el poder GIGANTE.
   */
  devour(player: Player, radius: number): GhostHit[] {
    return this.devourAt(player.x, player.y, radius, player);
  }

  /** Como `devour`, pero alrededor de cualquier punto (p. ej. la punta de un tentáculo del GHOUL). */
  devourAt(x: number, y: number, radius: number, player: Player): GhostHit[] {
    return this.devourWhere((g) => (g.x - x) ** 2 + (g.y - y) ** 2 <= radius * radius, player);
  }

  /**
   * Se come a los fantasmas que toca el rayo del láser: el segmento (x0,y0)–(x1,y1)
   * con `halfWidth` de grosor a cada lado.
   */
  zap(x0: number, y0: number, x1: number, y1: number, halfWidth: number, player: Player): GhostHit[] {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    return this.devourWhere((g) => {
      const t = Math.max(0, Math.min(1, ((g.x - x0) * dx + (g.y - y0) * dy) / len2));
      return (g.x - x0 - dx * t) ** 2 + (g.y - y0 - dy * t) ** 2 <= halfWidth * halfWidth;
    }, player);
  }

  /** Se come a los fantasmas activos (asustados o no, congelados o no) que cumplen `hit`. */
  devourWhere(hit: (g: Ghost) => boolean, player: Player): GhostHit[] {
    const eaten: GhostHit[] = [];
    const scores = CONFIG.ghosts.eatScores;
    for (const g of this.ghosts) {
      if (g.state !== 'normal' && g.state !== 'frightened') continue;
      if (!hit(g)) continue;
      eaten.push({ ghost: g, score: scores[Math.min(this.eatCombo++, scores.length - 1)] });
      g.home = this.pickSpawnTile(player) ?? { x: g.tileX, y: g.tileY };
      g.setState('eaten');
    }
    return eaten;
  }

  /** Reinicia la cadena de puntos por fantasmas comidos (p. ej. al empezar un poder). */
  resetCombo(): void {
    this.eatCombo = 0;
  }

  // ---------------------------------------------------------------------------

  private updateModes(dt: number): void {
    if (this.frightTimer > 0) {
      this.frightTimer -= dt;
      if (this.frightTimer <= 0) {
        for (const g of this.ghosts) if (g.state === 'frightened') g.setState('normal');
        this.frightOnSpawn.clear();
      }
      return; // el ciclo dispersión/persecución se congela mientras dura el susto
    }
    this.modeTimer += dt;
    const limit = this.scatter ? CONFIG.ghosts.scatterTime : CONFIG.ghosts.chaseTime;
    if (this.modeTimer >= limit) {
      this.modeTimer = 0;
      this.scatter = !this.scatter;
      for (const g of this.ghosts) if (g.state === 'normal') g.reverse();
    }
  }

  private updatePlayerField(dt: number, player: Player, lavaY: number): void {
    this.fieldAge += dt;
    const moved = this.playerField.sourceX !== player.tileX || this.playerField.sourceY !== player.tileY;
    if (!moved && this.fieldAge < 0.5) return;
    this.fieldAge = 0;
    const minY = Math.floor(lavaY) - 2;
    this.playerField.compute(this.maze, player.tileX, player.tileY, minY, this.maze.topY);
  }

  private chooseNormal(g: Ghost, options: Dir[], ctx: GhostBrainContext): Dir {
    const target = g.personality.target(g, ctx);
    if (target === 'pursue') {
      const best = this.bestBy(options, (d) => this.playerField.get(g.tileX + DX[d], g.tileY + DY[d]));
      if (best !== null) return best;
      return this.bestBy(options, (d) => this.euclid(g, d, ctx.player.tileX, ctx.player.tileY))!;
    }
    return this.bestBy(options, (d) => this.euclid(g, d, target.x, target.y))!;
  }

  private chooseHome(g: Ghost, options: Dir[]): Dir {
    if (!g.home) return options[0];
    let field = this.homeFields.get(g);
    if (!field) {
      field = new DistanceField();
      const ys = [g.tileY, g.home.y];
      field.compute(this.maze, g.home.x, g.home.y, Math.min(...ys) - 6, this.maze.topY);
      this.homeFields.set(g, field);
    }
    const f = field;
    return this.bestBy(options, (d) => f.get(g.tileX + DX[d], g.tileY + DY[d])) ?? this.rng.pick(options);
  }

  /** Opción con menor coste (desempate en orden clásico). Null si todas son infinitas. */
  private bestBy(options: Dir[], cost: (d: Dir) => number): Dir | null {
    let best: Dir | null = null;
    let bestCost = Infinity;
    for (const d of TIE_ORDER) {
      if (!options.includes(d)) continue;
      const c = cost(d);
      if (c < bestCost) {
        bestCost = c;
        best = d;
      }
    }
    return best;
  }

  private euclid(g: Ghost, d: Dir, tx: number, ty: number): number {
    return (g.tileX + DX[d] - tx) ** 2 + (g.tileY + DY[d] - ty) ** 2;
  }

  private pickSpawnTile(player: Player): { x: number; y: number } | null {
    const { spawnMinAhead, spawnMaxAhead } = CONFIG.ghosts;
    const tiles: Array<{ x: number; y: number }> = [];
    this.maze.forEachOpen(player.tileY + spawnMinAhead, player.tileY + spawnMaxAhead, (x, y) => tiles.push({ x, y }));
    return tiles.length ? this.rng.pick(tiles) : null;
  }

  private spawn(player: Player): boolean {
    const tile = this.pickSpawnTile(player);
    if (!tile) return false;
    const counts = new Map<GhostPersonality, number>(PERSONALITIES.map((p) => [p, 0]));
    for (const g of this.ghosts) counts.set(g.personality, (counts.get(g.personality) ?? 0) + 1);
    const personality = PERSONALITIES.reduce((a, b) => (counts.get(b)! < counts.get(a)! ? b : a));
    const ghost = new Ghost(personality, tile.x, tile.y);
    ghost.dir = 2;
    this.ghosts.push(ghost);
    return true;
  }

  /** Quita todos los fantasmas (p. ej. al saltar a otra zona con el modo dios). */
  clear(): void {
    [...this.ghosts].forEach((g) => this.remove(g));
    this.frightTimer = 0;
    this.frightOnSpawn.clear();
    this.freezeTimer = 0;
    this.ally = null;
    this.allyTimer = 0;
    this.allyPending = false;
  }

  private remove(g: Ghost): void {
    const i = this.ghosts.indexOf(g);
    if (i >= 0) this.ghosts.splice(i, 1);
    this.homeFields.delete(g);
    this.frightOnSpawn.delete(g);
    if (g === this.ally) {
      this.ally = null;
      this.allyTimer = 0;
    }
  }
}
