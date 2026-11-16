import * as THREE from 'three';
import { CONFIG, type SpecialPowerId } from '../config';
import type { GameContext } from '../core/Game';
import type { Action } from '../core/Input';
import type { GameMode } from '../core/ModeStack';
import { Rng } from '../core/Rng';
import { CameraRig } from './CameraRig';
import { GhostsView } from './entities/GhostsView';
import { Player } from './entities/Player';
import { PlayerView } from './entities/PlayerView';
import { ShatterEffect } from './effects/ShatterEffect';
import { PowerCinematic } from './effects/PowerCinematic';
import { SmokeEffect } from '../render/SmokeEffect';
import { TENTACLE_COUNT, TentacleView } from './effects/TentacleView';
import { GhoulLegs, type FootPlant, type GroundZ } from './systems/GhoulLegs';
import { escapeTiles } from './maze/escape';
import { Maze } from './maze/Maze';
import { MazeView } from './maze/MazeView';
import { DX, DY, Dir, Tile } from './maze/grid';
import { AutoScroll } from './systems/AutoScroll';
import { GhostDirector } from './systems/GhostDirector';
import { Lava } from './systems/Lava';
import { LavaView } from './systems/LavaView';
import { PelletType, Pellets } from './systems/Pellets';
import { PelletsView } from './systems/PelletsView';
import { Portals, type Portal } from './systems/Portals';
import { PortalsView } from './systems/PortalsView';
import { Gates, gateCenterY, type Gate } from './systems/Gates';
import { GatesView } from './systems/GatesView';
import { Abilities, type ShopSlot } from './systems/Abilities';
import { ABILITIES, abilityName, maxLevel, type AbilityDef } from './abilities/catalog';
import { Pickups, type Pickup } from './systems/Pickups';
import { PickupsView } from './systems/PickupsView';
import { Laser, type LaserBeam } from './systems/Laser';
import { LaserView } from './systems/LaserView';
import { Dash } from './systems/Dash';
import { Magnet } from './systems/Magnet';
import { DashTrail } from './effects/DashTrail';
import { ElementParticles } from './effects/ElementParticles';
import { FireIceView } from './effects/FireIceView';
import { FireIce, type Flame } from './systems/FireIce';
import { MagnetEffect } from './effects/MagnetEffect';
import { AbilityShopMode } from './ui/AbilityShopMode';
import { SpecialPowers } from './systems/SpecialPowers';
import { RunState, type DeathCause } from './systems/RunState';
import { WallBreaker } from './systems/WallBreaker';
import { GameOverScreen } from './ui/GameOverScreen';
import { Hud } from './ui/Hud';
import { Popups } from './ui/Popups';
import { PortalLabels } from './ui/PortalLabels';
import type { MinigameDef, MinigameResult, MinigameStakes } from '../minigames/types';
import type { Passable } from './entities/Player';
import { GodMenuMode, type GodMenuSection, type GodMenuToggle } from './dev/GodMenuMode';
import { anyCheat, godSettings, saveGodSettings, SKIP_MINIGAMES } from './dev/GodSettings';
import { ACTOR_Z, worldX } from './world';
import { HERO_DIAMETER, type HeroLook } from './entities/sprites';

export const GAME_ID = 'maze-run';

/** Alerta de color de las paredes (ver `NeonCycle.alert`) a partir de su configuración. */
const alertColors = (a: { dim: number; bright: number; period: number; duty: number }) => ({
  dim: new THREE.Color(a.dim),
  bright: new THREE.Color(a.bright),
  period: a.period,
  duty: a.duty,
});

const DIRECTION_ACTIONS: readonly Action[] = ['up', 'right', 'down', 'left'];
const ACTION_DIR: Record<string, Dir> = { up: Dir.Up, right: Dir.Right, down: Dir.Down, left: Dir.Left };

/** Color de las etiquetas flotantes y de los anuncios según su origen. */
const TAG_COLORS = { ice: '#7fd8ff', laser: '#ff8a1a', dash: '#6ab8ff', magnet: '#ff4a5a', wallBreak: '#ffd51a' };
const POWER_COLORS: Record<SpecialPowerId, string> = { giant: '#ffd51a', ghoul: '#ff2e3a', fireIce: '#ff8a1a' };
const ANNOUNCE = { good: '#3ae8ff', bad: '#ff2e3a' };

/** Lo que se juega en cada tipo de entrada a un minijuego. */
const PORTAL_STAKES: MinigameStakes = { kind: 'portal', wonText: 'TE LLEVAS UN PODER ESPECIAL', lostText: 'FIN DE LA PARTIDA' };
const GATE_STAKES: MinigameStakes = { kind: 'gate', wonText: '¡A LA TIENDA DE HABILIDADES!', lostText: 'TE QUEDAS SIN HABILIDAD' };

/** Entrada a un minijuego en curso: por un portal de sala o por un muro portal. */
interface Entering {
  target: { kind: 'portal'; portal: Portal } | { kind: 'gate'; gate: Gate };
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  absorbTime: number;
  launched: boolean;
}

/**
 * La carrera por el laberinto infinito. Crea y conecta los sistemas
 * (laberinto, puntos, jugador, fantasmas, lava, cámara, interfaz); cada uno
 * vive en su propio módulo y este modo solo coordina el orden de actualización
 * y las reglas que los relacionan (comer, morir, puntuar).
 *
 * Portales: al pisar uno, el jugador es absorbido (fase `portal`) y se apila el
 * minijuego encima (este modo queda en pausa). Al volver se aplica el resultado:
 * ganar activa un poder especial aleatorio; perder acaba la partida.
 *
 * Muros portal: barreras de lado a lado que hay que superar. Al tocarlas se
 * entra igual en su minijuego; ganar abre la tienda de habilidades y luego el
 * muro; perder acaba la partida.
 */
export class MazeRunMode implements GameMode {
  private scene = new THREE.Scene();
  private rng = new Rng();
  readonly state = new RunState();
  readonly maze = new Maze(this.rng);
  private mazeView = new MazeView(this.maze);
  private pellets = new Pellets(this.maze);
  private pelletsView = new PelletsView(this.pellets);
  private portals = new Portals(this.maze, this.rng);
  private portalsView = new PortalsView(this.portals);
  private gates = new Gates(this.maze, this.rng);
  private gatesView = new GatesView(this.gates);
  private abilities = new Abilities();
  /** Objetos de las habilidades (cubitos de hielo, bolas del láser). */
  private pickups = new Pickups(this.maze, this.pellets, this.portals, this.rng);
  private pickupsView = new PickupsView(this.pickups);
  private laser = new Laser();
  private laserView = new LaserView();
  /** Rayo del láser de este fotograma (null si no dispara). */
  private beam: LaserBeam | null = null;
  private dash = new Dash();
  private dashTrail = new DashTrail();
  private magnet = new Magnet();
  private magnetEffect = new MagnetEffect();
  private powers = new SpecialPowers();
  private tentacles = new TentacleView();
  /** Partículas de fuego y hielo (poder FUEGO HIELO y su cinemática). */
  private particles = new ElementParticles();
  private fireIce = new FireIce();
  private fireIceView = new FireIceView(this.particles);
  /** Llamarada de este fotograma (null si no hay). */
  private flame: Flame | null = null;
  /** El protagonista se mueve sobre hielo (se desliza más rápido). */
  private sliding = false;
  /** Altura extra del protagonista sobre la rampa de hielo (suavizada). */
  private iceLift = 0;
  private cinematic = new PowerCinematic(this.tentacles, this.particles);
  private legs = new GhoulLegs();
  /** Patas del GHOUL visibles al aterrizar, antes de que empiece el poder. */
  private legsLanding = false;
  /** El GHOUL estaba en vigor el fotograma anterior (para detectar cuándo acaba). */
  private wasGhoul = false;
  private legCurves = Array.from({ length: TENTACLE_COUNT }, () => {
    const pts = Array.from({ length: 4 }, () => new THREE.Vector3());
    return { pts, curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal') };
  });
  private smoke = new SmokeEffect();
  /** Fase a la que se vuelve al acabar la cinemática de un poder. */
  private phaseAfterCinematic: 'ready' | 'playing' = 'playing';
  private player = new Player();
  private playerView = new PlayerView();
  private ghosts = new GhostDirector(this.maze, this.rng);
  private ghostsView = new GhostsView();
  private lava = new Lava();
  private scroll = new AutoScroll(this.player.y);
  private lavaView = new LavaView();
  private wallBreaker = new WallBreaker();
  private shatter = new ShatterEffect();
  private cameraRig = new CameraRig();
  private hud!: Hud;
  private popups!: Popups;
  private portalLabels!: PortalLabels;
  private gateLabels!: PortalLabels;
  /** Portal o muro por el que se está entrando (absorción, minijuego y, tras un muro, la tienda). */
  private entering: Entering | null = null;
  /** Nombre del minijuego perdido, para el Game Over. */
  private lostMinigame: string | null = null;
  private gameOver: GameOverScreen | null = null;
  /** Se ha usado algún truco del modo dios en esta partida: no guarda récords. */
  private usedCheats = anyCheat();
  private stopResize: () => void = () => {};
  private projector = new THREE.Vector3();

  constructor(private ctx: GameContext) {}

  enter(): void {
    const { scene } = this;
    scene.background = new THREE.Color(0x03030a);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8), new THREE.HemisphereLight(0xffffff, 0x181020, 0.5));
    scene.add(this.cameraRig.light, this.cameraRig.light.target);
    scene.add(this.mazeView.group, this.pelletsView.group, this.playerView.mesh, this.ghostsView.group, this.lavaView.group, this.shatter.group, this.portalsView.group, this.gatesView.group, this.pickupsView.group, this.laserView.group, this.dashTrail.group, this.magnetEffect.group, this.fireIceView.group, this.cinematic.group, this.smoke.group, this.tentacles.group, this.particles.group);

    this.maze.ensureGenerated(this.player.tileY + CONFIG.maze.generateAhead);
    this.cameraRig.snap(this.scroll.y);

    this.hud = new Hud(this.ctx.ui, this.ctx.records.get(GAME_ID));
    this.hud.setStartHint(true);
    this.popups = new Popups(this.ctx.ui);
    this.portalLabels = new PortalLabels(this.ctx.ui);
    this.gateLabels = new PortalLabels(this.ctx.ui, 'MURO PORTAL · TOCALO PARA ENTRAR', 'gate-labels');
    this.stopResize = this.ctx.renderer.onResize((aspect) => this.cameraRig.setAspect(aspect));

    this.state.events.on('score', (e) => {
      if (e.showPopup) this.scorePopup(e.amount, e.x, e.y);
    });
  }

  exit(): void {
    this.stopResize();
    this.hud.dispose();
    this.popups.dispose();
    this.portalLabels.dispose();
    this.gateLabels.dispose();
    this.gameOver?.dispose();
    this.state.events.clear();
    this.pellets.dispose();
    this.portals.dispose();
    this.portalsView.dispose();
    this.gates.dispose();
    this.gatesView.dispose();
    this.pickups.dispose();
    this.pickupsView.dispose();
    this.laserView.dispose();
    this.dashTrail.dispose();
    this.magnetEffect.dispose();
    this.fireIceView.dispose();
    this.particles.dispose();
    this.mazeView.dispose();
    this.pelletsView.dispose();
    this.playerView.dispose();
    this.ghostsView.dispose();
    this.lavaView.dispose();
    this.shatter.dispose();
    this.cinematic.dispose();
    this.smoke.dispose();
    this.tentacles.dispose();
    this.cameraRig.light.dispose();
  }

  /** Otro modo (un minijuego) se pone encima: se oculta la interfaz. */
  pause(): void {
    this.hud.setVisible(false);
    this.portalLabels.setVisible(false);
    this.gateLabels.setVisible(false);
  }

  resume(): void {
    this.hud.setVisible(true);
    this.portalLabels.setVisible(true);
    this.gateLabels.setVisible(true);
  }

  update(dt: number): void {
    const { input } = this.ctx;
    const { state } = this;
    state.phaseTime += dt;

    if (input.pressed('camera')) {
      this.cameraRig.cycleView();
      this.hud.pressViewKey();
    }
    if (CONFIG.dev.godMenuKey && input.pressed('god') && (state.phase === 'ready' || state.phase === 'playing')) {
      this.ctx.modes.push(new GodMenuMode(this.ctx, this.godToggles(), this.godSections()));
      return;
    }

    switch (state.phase) {
      case 'ready': {
        const action = DIRECTION_ACTIONS.find((a) => input.pressed(a));
        if (action) {
          this.player.wantDir = ACTION_DIR[action];
          this.hud.setStartHint(false);
          state.setPhase('playing');
        }
        break;
      }
      case 'playing':
        this.updatePlaying(dt);
        break;
      case 'portal':
        this.updatePortal();
        break;
      case 'dying':
        if (state.phaseTime >= CONFIG.player.deathDuration) this.finish();
        break;
      case 'over':
        // El mundo queda congelado; solo se anima la ventana de fin de partida.
        this.gameOver?.update(dt);
        if (input.pressed('confirm')) this.ctx.modes.replace(new MazeRunMode(this.ctx));
        return;
    }

    this.updateViews(dt);
  }

  private updatePlaying(dt: number): void {
    const { input } = this.ctx;
    const { state, player, maze } = this;

    // Entrada: la última dirección pulsada queda en búfer hasta poder aplicarse.
    const pressed = DIRECTION_ACTIONS.find((a) => input.pressed(a));
    const held = input.latestHeld(DIRECTION_ACTIONS);
    if (pressed) player.wantDir = ACTION_DIR[pressed];
    else if (held) player.wantDir = ACTION_DIR[held];

    this.wallBreaker.infinite = godSettings.infiniteWallBreak;
    this.wallBreaker.update(dt);
    if (input.pressed('power')) this.usePowerKey();
    this.dash.update(dt);
    if (input.pressed('action')) this.useAction();

    const ended = this.powers.update(dt);
    if (ended) state.events.emit('specialPower', { id: ended, active: false });
    const giant = this.powers.giant;
    const ghoul = this.powers.ghoul;
    if (this.wasGhoul && !ghoul) this.endGhoul();
    this.wasGhoul = ghoul;

    const active = this.powers.active?.id;
    const boost = active && this.powers.isOn(active) ? CONFIG.specialPowers[active].speed : 1;
    const dashing = this.dash.inDash;
    // Sobre el hielo de FUEGO HIELO se desliza más rápido (GIGANTE y GHOUL no lo notan).
    this.sliding = !ghoul && !giant && this.fireIce.iceAt(player.tileX, player.tileY) && player.moving;
    const slide = this.sliding ? CONFIG.specialPowers.fireIce.ice.slide : 1;
    player.speedMultiplier = state.modifiers.playerSpeed * boost * slide * (dashing ? CONFIG.abilities.dash.dashSpeed : 1);
    const fromX = player.x;
    const fromY = player.y;
    player.update(dt, maze, giant ? this.giantPassable : ghoul ? this.ghoulPassable : this.icePassable);
    state.reachRow(player.tileY);
    this.updateIceLift(dt, giant || ghoul);

    if (giant) this.giantEat();
    else if (dashing) this.eatAlong(fromX, fromY, player.x, player.y);
    else this.eatPelletAt(player.tileX, player.tileY);
    this.magnetPull(dt);

    const portal = this.portals.touching(player.x, player.y);
    if (portal) return this.enterPortal(portal);
    const gate = this.gates.touching(player);
    if (gate) return this.enterGate(gate);

    this.ghosts.update(dt, player, state.meters, this.lava.y, state.modifiers.ghostSpeed);
    this.fireLaser(dt);
    this.updateFireIce(dt);
    // DASH: todo el recorrido del acelerón de este fotograma mata a los fantasmas que toca.
    if (dashing) {
      for (const { ghost, score } of this.ghosts.zap(fromX, fromY, player.x, player.y, CONFIG.abilities.dash.hitHalfWidth, player)) {
        state.addScore(score, ghost.x, ghost.y, true);
      }
    }
    if (giant) {
      const radius = CONFIG.ghosts.hitRadius + CONFIG.specialPowers.giant.reach - 0.5;
      for (const { ghost, score } of this.ghosts.devour(player, radius)) state.addScore(score, ghost.x, ghost.y, true);
    } else if (ghoul) {
      this.ghoulWalk(dt);
    } else {
      const hit = this.ghosts.checkPlayer(player);
      for (const { ghost, score } of hit.eaten) state.addScore(score, ghost.x, ghost.y, true);
      if (hit.killed && !godSettings.invincible) return this.die('ghost');
    }

    // El escenario sube solo; la lava persigue el borde inferior de la pantalla (puede quedarse atrás un rato).
    this.scroll.update(dt, state.meters, player.y, state.modifiers.scrollSpeed, true);
    const screenBottom = this.scroll.y - this.cameraRig.halfHeight;
    this.lava.update(dt, state.meters, screenBottom + CONFIG.lava.screenOffset, state.modifiers.lavaSpeed);
    if (this.lava.touches(player.y) && !godSettings.invincible) return this.die('lava');

    maze.ensureGenerated(player.tileY + CONFIG.maze.generateAhead);
    maze.destroyBelow(Math.floor(this.lava.y) - CONFIG.maze.destroyBelowLava);
    // Objetos de habilidad (HIELO, LASER): empiezan a aparecer un poco por delante en cuanto se tiene la habilidad.
    for (const kind of this.abilities.pickups) this.pickups.enable(kind, player.y);
    this.pickups.update(this.lava.y);
  }

  /** Come todo lo que hay en las casillas de un recorrido (un dash avanza más de una casilla por fotograma). */
  private eatAlong(x0: number, y0: number, x1: number, y1: number): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.5));
    let last = '';
    for (let i = 0; i <= steps; i++) {
      const tx = Math.round(x0 + ((x1 - x0) * i) / steps);
      const ty = Math.round(y0 + ((y1 - y0) * i) / steps);
      const key = `${tx},${ty}`;
      if (key === last) continue;
      last = key;
      this.eatPelletAt(tx, ty);
    }
  }

  /**
   * Come el punto de una casilla y coge el objeto de habilidad que haya, salvo con
   * un poder especial (entonces no se cogen: se quedan donde están).
   */
  private eatPelletAt(x: number, y: number, takePickups = true): void {
    const { state } = this;
    const pickup = takePickups && !this.powers.active ? this.pickups.takeAt(x, y) : null;
    if (pickup) this.takePickup(pickup);
    const pellet = this.pellets.eatAt(x, y);
    if (pellet?.type === PelletType.Dot) state.addScore(CONFIG.pellets.dotScore, pellet.x, pellet.y);
    if (pellet?.type === PelletType.Energizer) {
      state.addScore(CONFIG.pellets.energizerScore, pellet.x, pellet.y, true);
      state.events.emit('energizer', { duration: this.ghosts.frighten(state.meters, this.abilities.frightBonus) });
    }
  }

  /** Objeto de habilidad cogido: cubito de hielo (congela a los fantasmas) o bola del láser (dispara). */
  private takePickup(p: Pickup): void {
    if (p.kind === 'ice') {
      const { freezeTime } = CONFIG.abilities.ice;
      this.ghosts.freeze(freezeTime);
      this.tagPopup('HIELO', p.x, p.y, TAG_COLORS.ice);
      this.cameraRig.shake(0.15);
      this.state.events.emit('ghostsFrozen', { duration: freezeTime });
    } else if (p.kind === 'laser') {
      const duration = this.abilities.laserDuration || CONFIG.abilities.laser.duration;
      this.laser.fire(duration);
      this.tagPopup('LASER', p.x, p.y, TAG_COLORS.laser);
      this.cameraRig.shake(0.2);
      this.state.events.emit('laserFired', { duration });
    } else if (p.kind === 'dash') {
      this.dash.grant(CONFIG.abilities.dash.duration);
      this.tagPopup('DASH', p.x, p.y, TAG_COLORS.dash);
    } else {
      this.magnet.grant(this.abilities.magnetDuration || CONFIG.abilities.magnet.duration);
      this.tagPopup('IMAN', p.x, p.y, TAG_COLORS.magnet);
    }
  }

  /**
   * Tecla Z: ROMPEMUROS. Con un poder especial no se pueden romper muros: la Z hace
   * la acción del poder si tiene una (FUEGO HIELO: rastro de hielo) o nada.
   */
  private usePowerKey(): void {
    if (!this.powers.active) return this.useWallBreak();
    this.hud.pressPowerKey();
    const { player } = this;
    if (this.powers.fireIce && this.fireIce.tryIce(this.maze, player.x, player.y, player.dir)) {
      this.cameraRig.shake(0.1);
      this.state.events.emit('elementShot', { kind: 'ice' });
    }
  }

  /** Tecla de acción (X): hace la acción disponible ahora mismo (llamarada de FUEGO HIELO o dash de DASH). */
  private useAction(): void {
    this.hud.pressActionKey();
    if (this.powers.fireIce) {
      if (this.fireIce.tryFire()) {
        this.cameraRig.shake(0.12);
        this.state.events.emit('elementShot', { kind: 'fire' });
      }
      return;
    }
    if (this.dash.tryDash()) {
      this.cameraRig.shake(0.12);
      this.state.events.emit('dash', {});
    }
  }

  /** IMAN: los puntos pequeños cercanos se comen solos y vuelan hacia el protagonista. */
  private magnetPull(dt: number): void {
    this.magnet.update(dt);
    if (!this.magnet.active) return;
    const eaten = this.magnet.attract(this.pellets, this.player.x, this.player.y);
    for (const p of eaten) this.state.addScore(CONFIG.pellets.dotScore, p.x, p.y);
    this.magnetEffect.pull(eaten);
  }

  /** Láser: el rayo sale por la boca hacia donde mira el protagonista y se come a los fantasmas que toca. */
  private fireLaser(dt: number): void {
    const { player, state } = this;
    this.laser.update(dt);
    this.beam = this.laser.active ? this.laser.beam(this.maze, player.x, player.y, player.dir) : null;
    if (!this.beam) return;
    const { x0, y0, x1, y1 } = this.beam;
    for (const { ghost, score } of this.ghosts.zap(x0, y0, x1, y1, CONFIG.abilities.laser.hitHalfWidth, player)) {
      state.addScore(score, ghost.x, ghost.y, true);
    }
  }

  // ---------------------------------------------------------------------------
  // Poder FUEGO HIELO
  // ---------------------------------------------------------------------------

  /**
   * Hielo: al cuajar, come los puntos que cubre; los fantasmas que lo pisan mueren.
   * Fuego: la llamarada quema los bloques, los fantasmas y los puntos que alcanza.
   * El hielo se sigue derritiendo (y matando) aunque el poder haya acabado.
   */
  private updateFireIce(dt: number): void {
    const { state, player, maze, fireIce } = this;
    for (const t of fireIce.update(dt, this.lava.y)) if (maze.isOpen(t.x, t.y)) this.eatPelletAt(t.x, t.y, false);
    for (const { ghost, score } of this.ghosts.devourWhere((g) => fireIce.iceAt(g.tileX, g.tileY), player)) {
      state.addScore(score, ghost.x, ghost.y, true);
      this.fireIceView.ghostBurst(ghost.x, ghost.y, 'ice');
    }

    this.flame = this.powers.fireIce ? fireIce.flame(maze, player.x, player.y, player.dir) : null;
    const flame = this.flame;
    if (!flame) return;
    if (flame.walls.length) {
      maze.setTiles(flame.walls, Tile.Open);
      this.shatter.burst(flame.walls, flame.dir, this.fireColor, true);
      this.fireIceView.burnBurst(flame.walls);
      this.cameraRig.shake(CONFIG.specialPowers.fireIce.fire.shake);
      state.events.emit('wallBroken', { tiles: flame.walls });
    }
    for (const t of flame.open) this.eatPelletAt(t.x, t.y, false);
    for (const { ghost, score } of this.ghosts.devourWhere((g) => fireIce.inFlame(flame, g.x, g.y, 0.35), player)) {
      state.addScore(score, ghost.x, ghost.y, true);
      this.fireIceView.ghostBurst(ghost.x, ghost.y, 'fire');
    }
  }

  private readonly fireColor = new THREE.Color(0xff6a1a);
  private readonly iceColor = new THREE.Color(0x9fe6ff);

  /** Sobre la rampa de hielo se pasa por encima de los bloques que cubre (no del borde ni de los muros portal). */
  private readonly icePassable: Passable = (x, y) =>
    this.maze.isOpen(x, y) || (this.maze.tile(x, y) === Tile.Wall && this.fireIce.iceAt(x, y));

  /**
   * Altura sobre la rampa de hielo: sube y baja suave siguiendo la superficie. Si
   * el hielo se derrite con el protagonista encima de un bloque, cae rompiéndolo
   * (y se abre el camino más corto hasta los pasillos, para no quedar atrapado).
   */
  private updateIceLift(dt: number, otherPower: boolean): void {
    const { player, maze } = this;
    const onWall = maze.tile(player.tileX, player.tileY) === Tile.Wall;
    if (!otherPower && onWall && !this.fireIce.iceAt(player.tileX, player.tileY)) this.dropFromIce();
    const surface = otherPower ? null : this.fireIce.surface(player.tileX, player.tileY, onWall);
    const target = surface === null ? 0 : Math.max(0, surface + 0.5 - ACTOR_Z);
    this.iceLift += (target - this.iceLift) * (1 - Math.exp(-18 * dt));
  }

  private dropFromIce(): void {
    const { player, maze } = this;
    const here = { x: player.tileX, y: player.tileY };
    maze.setTiles([here], Tile.Open);
    const path = escapeTiles(maze, here.x, here.y);
    if (path.length) maze.setTiles(path, Tile.Open);
    const broken = [here, ...path];
    this.shatter.burst(broken, player.dir, this.iceColor, true);
    this.cameraRig.shake(0.25);
    this.state.events.emit('wallBroken', { tiles: broken });
  }

  // ---------------------------------------------------------------------------
  // Poder GIGANTE
  // ---------------------------------------------------------------------------

  /** El gigante puede entrar en muros, salvo en el borde exterior y en la columna pegada a él. */
  private readonly giantPassable: Passable = (x, y) => {
    // Su centro no entra en muros tan cerca del borde que el cuerpo lo atravesaría.
    const margin = 1 + Math.floor(CONFIG.specialPowers.giant.reach);
    return this.maze.isOpen(x, y) || (this.maze.tile(x, y) === Tile.Wall && x >= margin && x <= this.maze.width - 1 - margin);
  };

  /** Come muros y puntos alrededor de su centro (≈ 6×6 casillas). El borde exterior no se come. */
  private giantEat(): void {
    const { player, maze } = this;
    const { reach, shake } = CONFIG.specialPowers.giant;
    const walls: Array<{ x: number; y: number }> = [];
    for (let ty = Math.ceil(player.y - reach); ty <= Math.floor(player.y + reach); ty++) {
      for (let tx = Math.ceil(player.x - reach); tx <= Math.floor(player.x + reach); tx++) {
        if (tx < 1 || tx > maze.width - 2) continue;
        const tile = maze.tile(tx, ty);
        if (tile === Tile.Wall) walls.push({ x: tx, y: ty });
        else if (tile === Tile.Open) this.eatPelletAt(tx, ty);
      }
    }
    if (!walls.length) return;
    maze.setTiles(walls, Tile.Open);
    this.shatter.burst(walls, player.dir, this.mazeView.neon.color, true);
    this.cameraRig.shake(shake);
    this.state.events.emit('wallBroken', { tiles: walls });
  }

  // ---------------------------------------------------------------------------
  // Poder GHOUL
  // ---------------------------------------------------------------------------

  /** El GHOUL camina por encima de cualquier casilla salvo el borde exterior y los muros portal. */
  private readonly ghoulPassable: Passable = (x, y) => {
    const tile = this.maze.tile(x, y);
    return tile !== undefined && tile !== Tile.Gate && x >= 1 && x <= this.maze.width - 2;
  };

  /** Altura del suelo bajo un pie: 0 si se clava (pasillo o bloque que se rompe); la tapa si es irrompible. */
  private readonly groundZ: GroundZ = (x, y) => {
    const tx = Math.round(x);
    const tile = this.maze.tile(tx, Math.round(y));
    const breakable = tx >= 1 && tx <= this.maze.width - 2;
    // Sobre un muro portal el pie se apoya encima del campo de energía.
    if (tile === Tile.Gate) return CONFIG.maze.wallDepth + 0.06;
    return tile === undefined || (tile === Tile.Wall && !breakable) ? CONFIG.maze.wallDepth : 0;
  };

  /** Pasos de los tentáculos: rompen los bloques que pisan y pisotean fantasmas; el cuerpo también los mata. */
  private ghoulWalk(dt: number): void {
    const { player, state } = this;
    const speed = player.moving ? CONFIG.player.speed * player.speedMultiplier : 0;
    const plants = this.legs.update(dt, player.x, player.y, DX[player.dir] * speed, DY[player.dir] * speed, this.ghosts.ghosts, this.groundZ);
    plants.forEach((p) => this.plantFoot(p));
    // El cuerpo (grande) también mata al tocar.
    const bodyRadius = CONFIG.ghosts.hitRadius + (HERO_DIAMETER / 2) * (this.powers.playerScale - 1);
    for (const { ghost, score } of this.ghosts.devourAt(player.x, player.y, bodyRadius, player)) {
      state.addScore(score, ghost.x, ghost.y, true);
    }
  }

  private plantFoot(p: FootPlant): void {
    const { maze, state } = this;
    const cfg = CONFIG.specialPowers.ghoul;
    const tx = Math.round(p.x);
    const ty = Math.round(p.y);
    if (tx >= 1 && tx <= maze.width - 2 && maze.tile(tx, ty) === Tile.Wall) {
      const tiles = [{ x: tx, y: ty }];
      maze.setTiles(tiles, Tile.Open);
      this.shatter.burst(tiles, this.player.dir, this.mazeView.neon.color, true);
      this.cameraRig.shake(cfg.shake);
      state.events.emit('wallBroken', { tiles });
    }
    // Polvillo pequeño en cada pisada (más en los pisotones).
    this.smoke.ring(worldX(p.x), p.y, 0.25, 0.2, p.stomp ? 7 : 3, 0.4);
    for (const { ghost, score } of this.ghosts.devourAt(p.x, p.y, cfg.stompRadius, this.player)) {
      state.addScore(score, ghost.x, ghost.y, true);
      this.cameraRig.shake(cfg.shake * 2);
    }
  }

  /**
   * Fin del GHOUL: cae al suelo rompiendo los bloques de alrededor (las pisadas
   * pueden haberle dejado encerrado). Si aun así queda aislado, se abre el camino
   * más corto hasta los pasillos para no quedar atrapado nunca.
   */
  private endGhoul(): void {
    const { player, maze } = this;
    const R = CONFIG.specialPowers.ghoul.landBreakRadius;
    const walls: Array<{ x: number; y: number }> = [];
    for (let ty = Math.ceil(player.y - R); ty <= Math.floor(player.y + R); ty++) {
      for (let tx = Math.max(1, Math.ceil(player.x - R)); tx <= Math.min(maze.width - 2, Math.floor(player.x + R)); tx++) {
        if ((tx - player.x) ** 2 + (ty - player.y) ** 2 <= R * R && maze.tile(tx, ty) === Tile.Wall) walls.push({ x: tx, y: ty });
      }
    }
    if (walls.length) maze.setTiles(walls, Tile.Open);
    // Si va entre dos casillas, terminará en la siguiente: el camino se busca desde ahí.
    const next = { x: Math.round(player.x + DX[player.dir] * 0.5), y: Math.round(player.y + DY[player.dir] * 0.5) };
    if (maze.tile(next.x, next.y) === Tile.Wall && next.x >= 1 && next.x <= maze.width - 2) {
      maze.setTiles([next], Tile.Open);
      walls.push(next);
    }
    const path = escapeTiles(maze, next.x, next.y);
    if (path.length) maze.setTiles(path, Tile.Open);
    const broken = [...walls, ...path];
    // Golpe de la caída: sacudida y humo aunque no haya bloques que romper.
    this.cameraRig.shake(0.35);
    this.smoke.ring(worldX(player.x), player.y, CONFIG.maze.wallDepth * 0.5, R, 18, 0.7);
    if (broken.length) {
      this.shatter.burst(broken, player.dir, this.mazeView.neon.color, true);
      this.state.events.emit('wallBroken', { tiles: broken });
    }
  }

  /**
   * Tentáculos como patas: salen del borde del cuerpo por debajo de él (para que el
   * cuerpo quede siempre a la vista, encima) y bajan en arco hasta cada pie.
   */
  private drawLegs(extent: number): void {
    const body = this.playerView.mesh.position;
    const t = this.state.phaseTime;
    // A escala del cuerpo (encoge con él al acabar el poder).
    const k = Math.abs(this.playerView.mesh.scale.y) / CONFIG.specialPowers.ghoul.scale;
    this.legs.feet.forEach((f, i) => {
      const { pts, curve } = this.legCurves[i];
      const fx = worldX(f.x);
      const dx = fx - body.x;
      const dy = f.y - body.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      const [r0, r1] = CONFIG.specialPowers.ghoul.thickness;
      const below = body.z - r0 * k - 0.15;
      const bodyR = (HERO_DIAMETER / 2) * Math.abs(this.playerView.mesh.scale.y);
      // Se retuercen con ondas de varias frecuencias (algo caótico, sin pasarse).
      const w = CONFIG.specialPowers.ghoul.writhe * k;
      const n1 = (a: number) => Math.sin(t * (4.1 + i * 0.7) + a + i * 1.9) * 0.6 + Math.sin(t * (9.3 - i * 0.9) + a * 2.3) * 0.4;
      const reachMid = Math.max(bodyR, dist * 0.5);
      pts[0].set(body.x + ux * bodyR * 0.6, body.y + uy * bodyR * 0.6, below);
      pts[1].set(
        body.x + ux * reachMid - uy * n1(0) * w * 1.6,
        body.y + uy * reachMid + ux * n1(0) * w * 1.6,
        below + 0.1 * k + n1(1.3) * w,
      );
      pts[2].set(body.x + dx * 0.82 - uy * n1(2.1) * w, body.y + dy * 0.82 + ux * n1(2.1) * w, f.z + 0.7 * k + Math.abs(n1(3.7)) * w);
      pts[3].set(fx, f.y, f.z);
      curve.updateArcLengths();
      this.tentacles.set(i, curve, r0 * k, r1 * Math.max(0.6, k), extent);
    });
  }

  // ---------------------------------------------------------------------------
  // Portales y minijuegos
  // ---------------------------------------------------------------------------

  private enterPortal(portal: Portal): void {
    const { player } = this;
    this.entering = {
      target: { kind: 'portal', portal },
      fromX: player.x,
      fromY: player.y,
      toX: portal.x,
      toY: portal.y,
      absorbTime: CONFIG.portals.absorbTime,
      launched: false,
    };
    this.portalsView.absorbing = portal;
    this.state.setPhase('portal');
    this.state.events.emit('portalEntered', { game: portal.game.id });
  }

  /** Tocar un muro portal: el jugador se mete en el muro (en su columna) y se abre su minijuego. */
  private enterGate(gate: Gate): void {
    const { player } = this;
    this.entering = {
      target: { kind: 'gate', gate },
      fromX: player.x,
      fromY: player.y,
      toX: player.tileX,
      toY: Math.round(gateCenterY(gate)),
      absorbTime: CONFIG.gates.absorbTime,
      launched: false,
    };
    this.gatesView.absorbing = gate;
    this.state.setPhase('portal');
    this.state.events.emit('gateEntered', { game: gate.game.id });
  }

  /** Absorción: el jugador va al portal (o dentro del muro) girando y encogiendo; luego se abre el minijuego. */
  private updatePortal(): void {
    const e = this.entering;
    if (!e || e.launched) return;
    const t = Math.min(1, this.state.phaseTime / e.absorbTime);
    this.player.x = e.fromX + (e.toX - e.fromX) * t;
    this.player.y = e.fromY + (e.toY - e.fromY) * t;
    if (t < 1) return;
    e.launched = true;
    const { target } = e;
    // (Modo dios) Saltar el minijuego: se da por ganado o perdido sin jugarlo.
    const skip = godSettings.skipMinigames;
    if (skip !== 'off') this.usedCheats ||= skip === 'win';
    const play = (game: MinigameDef, done: (result: MinigameResult) => void, stakes: MinigameStakes) => {
      if (skip === 'off') this.ctx.modes.push(game.create(this.ctx, done, stakes));
      else done({ won: skip === 'win' });
    };
    if (target.kind === 'portal') {
      const { portal } = target;
      this.portals.close(portal);
      this.portalsView.absorbing = null;
      play(portal.game, (result) => this.onMinigameDone(portal, result), PORTAL_STAKES);
    } else {
      const { gate } = target;
      play(gate.game, (result) => this.onGateMinigameDone(gate, result), GATE_STAKES);
    }
  }

  /**
   * Vuelta del minijuego de un muro: siempre se abre la tienda y luego el muro.
   * Si se ha perdido, las cartas salen bloqueadas (no se puede escoger ninguna), pero no se muere (D-060).
   */
  private onGateMinigameDone(gate: Gate, result: MinigameResult): void {
    this.state.events.emit('minigameResult', { game: gate.game.id, won: result.won });
    this.openShop(gate, !result.won);
  }

  /** Tienda de habilidades: una casilla por nivel; al cerrarla se abre el muro. `blocked`: se ve pero no se puede comprar. */
  private openShop(gate: Gate, blocked: boolean): void {
    const { state } = this;
    this.ctx.modes.push(
      new AbilityShopMode(this.ctx, {
        blocked,
        slots: this.abilities.offer(this.rng),
        points: () => state.score,
        level: (a) => this.abilities.level(a),
        buy: (slot: ShopSlot) => {
          const price = CONFIG.abilities.tiers[slot.tier].price;
          if (!slot.ability || !this.abilities.canBuy(slot.ability) || !state.spend(price)) return false;
          this.abilities.add(slot.ability);
          state.events.emit('abilityBought', { id: slot.ability.id, tier: slot.tier, price });
          return true;
        },
        done: (bought) => this.openGate(gate, bought),
      }),
    );
  }

  /** El muro se abre: se disuelve, estalla en pedazos y el jugador reaparece en él y sigue. */
  private openGate(gate: Gate, bought: AbilityDef | null): void {
    this.entering = null;
    this.gatesView.absorbing = null;
    this.gates.open(gate);
    const color = new THREE.Color().setHSL(this.gatesView.currentHue, 1, 0.6);
    this.shatter.burst(this.gates.tiles(gate).filter((t) => t.x % 2 === 1), Dir.Up, color, true);
    this.cameraRig.shake(0.4);
    this.state.setPhase('playing');
    // Al salir del muro, los fantasmas se asustan como con un energizador (también los que están
    // apareciendo): entre el muro que se deshace y la animación no se ven bien y era fácil chocar
    // con uno sin querer (D-061).
    this.ghosts.frighten(this.state.meters, this.abilities.frightBonus, true);
    this.grantWallBreak();
    const name = bought ? abilityName(bought, this.abilities.level(bought)) : '';
    this.refreshAbilities(name);
    // Comprar no muestra anuncio (es de los poderes especiales): salta su etiqueta en el HUD.
    if (!bought) this.hud.announce('¡ADELANTE!', 'MURO SUPERADO', ANNOUNCE.good);
  }

  /** Superar un portal o un muro portal da un ROMPEMUROS más. */
  private grantWallBreak(): void {
    const n = CONFIG.powers.wallBreak.perPortal;
    this.wallBreaker.grant(n);
    this.tagPopup(`+${n} ROMPEMUROS`, this.player.x, this.player.y, TAG_COLORS.wallBreak);
    this.hud.pulsePower();
  }

  /** Aspecto del protagonista: el del poder especial si hay uno; si no, azulado con DASH (parpadea al acabarse). */
  private heroLook(): HeroLook {
    // FUEGO HIELO parpadea al acabarse.
    const blink = Math.floor(this.state.phaseTime * 8) % 2 === 0;
    if (this.powers.look === 'fireice') return this.powers.warning && blink ? 'normal' : 'fireice';
    if (this.powers.look !== 'normal') return this.powers.look;
    if (!this.dash.active) return 'normal';
    return this.dash.warning && Math.floor(this.state.phaseTime * 8) % 2 === 0 ? 'normal' : 'dash';
  }

  /** Lista de habilidades compradas en el HUD. */
  private refreshAbilities(highlight = ''): void {
    const items = [...this.abilities.owned].map(([a, level]) => ({ name: abilityName(a, level), color: CONFIG.abilities.tiers[a.tier].color }));
    this.hud.setAbilities(items, highlight);
  }

  /**
   * Recibir un poder: primero la cinemática (la partida queda congelada) y, al
   * aterrizar, empieza el poder de verdad.
   */
  private activatePower(id: SpecialPowerId): void {
    const { state } = this;
    if (state.phase === 'cinematic') return;
    this.phaseAfterCinematic = state.phase === 'ready' ? 'ready' : 'playing';
    state.setPhase('cinematic');
    const { impactShake, smokePuffs } = CONFIG.specialPowers.cinematic;
    const current = { scale: this.powers.playerScale, lift: this.powers.ghoulLift + this.iceLift, look: this.powers.look };
    // Un poder nuevo sustituye al anterior sin su animación de salida.
    if (this.powers.ghoul) this.endGhoul();
    this.powers.clear();
    this.wasGhoul = false;
    this.flame = null;
    this.clearAbilityEffects();
    this.cinematic.play(id, this.player, current, (amount) => this.cameraRig.shake(amount), {
      onImpact: (at, scale) => {
        this.cameraRig.shake(impactShake);
        // Por encima de los muros, para que no lo tapen.
        this.smoke.ring(at.x, at.y, CONFIG.maze.wallDepth + 0.15, (HERO_DIAMETER / 2) * scale + 0.2, smokePuffs);
        if (id === 'fireIce') this.fireIceView.landBurst(at.x, at.y, at.z);
        // El GHOUL aterriza clavando los cuatro tentáculos.
        if (id === 'ghoul') {
          this.legsLanding = true;
          this.legs.reset(this.player.x, this.player.y, this.groundZ).forEach((p) => this.plantFoot(p));
        }
      },
      onDone: () => {
        this.legsLanding = false;
        state.setPhase(this.phaseAfterCinematic);
        this.powers.activate(id);
        this.ghosts.resetCombo();
        this.hud.announce(`¡${this.powers.name(id)}!`, id === 'fireIce' ? CONFIG.specialPowers.fireIce.announceSub : 'PODER ESPECIAL', POWER_COLORS[id]);
        state.events.emit('specialPower', { id, active: true });
      },
    });
  }

  /**
   * Un poder especial y las habilidades no se mezclan: al recibir un poder se
   * pierden los efectos de habilidad en curso (láser, dash, imán y congelación).
   * Las habilidades compradas se conservan: sus objetos vuelven a poder cogerse
   * cuando acaba el poder.
   */
  private clearAbilityEffects(): void {
    this.laser.clear();
    this.beam = null;
    this.dash.clear();
    this.magnet.clear();
    this.ghosts.unfreeze();
  }

  // ---------------------------------------------------------------------------
  // Modo dios (desarrollo)
  // ---------------------------------------------------------------------------

  /** Trucos del menú de la tecla K (se recuerdan entre partidas). */
  private godToggles(): GodMenuToggle[] {
    const flag = (label: string, key: 'invincible' | 'infiniteWallBreak'): GodMenuToggle => ({
      label,
      value: () => (godSettings[key] ? 'SI' : 'NO'),
      on: () => godSettings[key],
      toggle: () => {
        godSettings[key] = !godSettings[key];
        saveGodSettings();
        this.usedCheats ||= godSettings[key];
      },
    });
    const skipNames = { off: 'NO', win: 'GANAR', lose: 'PERDER' } as const;
    const skip: GodMenuToggle = {
      label: 'SALTAR MINIJUEGOS',
      value: () => skipNames[godSettings.skipMinigames],
      on: () => godSettings.skipMinigames !== 'off',
      toggle: () => {
        const i = SKIP_MINIGAMES.indexOf(godSettings.skipMinigames);
        godSettings.skipMinigames = SKIP_MINIGAMES[(i + 1) % SKIP_MINIGAMES.length];
        saveGodSettings();
      },
    };
    return [flag('INVENCIBLE', 'invincible'), flag('ROMPER MURO INFINITO', 'infiniteWallBreak'), skip];
  }

  /**
   * Acciones del menú (con clic se cierra el menú y se ejecutan): lanzar o quitar
   * poderes especiales (con su cinemática), teletransportes y pruebas.
   */
  private godSections(): GodMenuSection[] {
    const isActive = (id: SpecialPowerId) => this.powers.active?.id === id && this.powers.remaining > 0;
    const powers = CONFIG.specialPowers.pool.map((id) => ({
      label: this.powers.name(id),
      button: () => (isActive(id) ? 'QUITAR' : 'ACTIVAR'),
      run: () => {
        this.usedCheats = true;
        if (isActive(id)) this.powers.deactivate();
        else this.activatePower(id);
      },
    }));
    const forward = (meters: number) => ({
      label: `AVANZAR ${meters} M`,
      button: () => 'IR',
      run: () => this.teleportForward(meters),
    });
    const teleports = [
      { label: 'SIGUIENTE PORTAL', button: () => 'IR', run: () => this.teleportToPortal() },
      { label: 'SIGUIENTE MURO PORTAL', button: () => 'IR', run: () => this.teleportToGate() },
      forward(100),
      forward(500),
      forward(1000),
    ];
    const tests = [
      {
        label: 'SUMAR 10000 PUNTOS',
        button: () => 'SUMAR',
        run: () => {
          this.usedCheats = true;
          this.state.addScore(10000, this.player.x, this.player.y);
        },
      },
    ];
    const abilities = ABILITIES.map((a) => ({
      label: `${abilityName(a, Math.min(maxLevel(a), this.abilities.level(a) + 1))} (${CONFIG.abilities.tiers[a.tier].name})`,
      button: () => (this.abilities.canBuy(a) ? 'DAR' : 'MAX'),
      run: () => {
        if (!this.abilities.add(a)) return;
        this.usedCheats = true;
        const name = abilityName(a, this.abilities.level(a));
        this.refreshAbilities(name);
      },
    }));
    return [
      { title: 'TELETRANSPORTE', color: '#5aff8a', actions: teleports },
      { title: 'HABILIDADES', color: '#b04bff', actions: abilities },
      { title: 'PODERES ESPECIALES', color: '#ff5ad8', actions: powers },
      { title: 'PRUEBAS', color: '#ffc21a', actions: tests },
    ];
  }

  /** (Desarrollo) Justo debajo del siguiente muro portal cerrado. */
  private teleportToGate(): void {
    const gate = this.generateUntil(() => this.gates.nextClosedAbove(this.player.y));
    if (gate) this.teleport(CONFIG.player.startColumn, gate.y0 - 1);
  }

  /** (Desarrollo) En la sala del siguiente portal abierto, un poco por debajo del portal. */
  private teleportToPortal(): void {
    const y = this.player.y + 1;
    const portal = this.generateUntil(() =>
      this.portals.list.filter((p) => p.open && p.y > y).sort((a, b) => a.y - b.y)[0] ?? null,
    );
    if (portal) this.teleport(portal.x, portal.y - 2);
  }

  /** (Desarrollo) N metros más arriba (salta los muros portal que haya en medio). */
  private teleportForward(meters: number): void {
    const y = this.player.tileY + Math.round(meters / CONFIG.scoring.metersPerRow);
    this.maze.ensureGenerated(y + CONFIG.maze.generateAhead);
    this.teleport(CONFIG.player.startColumn, y);
  }

  /** Genera laberinto hacia arriba hasta que `find` encuentre algo (o se rinde). */
  private generateUntil<T>(find: () => T | null): T | null {
    let found = find();
    for (let guard = 0; !found && guard < 400; guard++) {
      this.maze.ensureGenerated(this.maze.topY + 1);
      found = find();
    }
    return found;
  }

  /** Casilla abierta más cercana a (x, y): busca en esa fila y, si no hay, en las de debajo. */
  private nearestOpen(x: number, y: number): { x: number; y: number } | null {
    const { width } = CONFIG.maze;
    for (let dy = 0; dy < 12; dy++) {
      for (let dx = 0; dx < width; dx++) {
        for (const tx of dx ? [x - dx, x + dx] : [x]) {
          if (this.maze.isOpen(tx, y - dy)) return { x: tx, y: y - dy };
        }
      }
    }
    return null;
  }

  /**
   * (Desarrollo) Lleva al jugador a la casilla abierta más cercana a (x, y): sin
   * poderes ni fantasmas, con la lava detrás y la cámara ya colocada.
   */
  private teleport(x: number, y: number): void {
    const { player, maze } = this;
    if (this.state.phase !== 'ready' && this.state.phase !== 'playing') return;
    maze.ensureGenerated(y + CONFIG.maze.generateAhead);
    const to = this.nearestOpen(x, y);
    if (!to) return;
    this.usedCheats = true;
    if (this.powers.ghoul) this.endGhoul();
    this.powers.clear();
    this.wasGhoul = false;
    player.x = to.x;
    player.y = to.y;
    player.wantDir = null;
    player.dir = Dir.Left;
    player.moving = false;
    this.state.reachRow(player.tileY);
    this.ghosts.clear();
    this.laser.clear();
    this.dash.clear();
    this.magnet.clear();
    this.fireIce.clear();
    this.flame = null;
    this.iceLift = 0;
    this.lava.y = player.y + CONFIG.lava.startOffset;
    this.scroll.y = player.y + CONFIG.camera.lookAhead;
    this.cameraRig.snap(this.scroll.y);
    maze.destroyBelow(Math.floor(this.lava.y) - CONFIG.maze.destroyBelowLava);
  }

  /** Vuelta del minijuego (este modo ya se ha reanudado). */
  private onMinigameDone(portal: Portal, result: MinigameResult): void {
    const { state } = this;
    this.entering = null;
    state.events.emit('minigameResult', { game: portal.game.id, won: result.won });
    if (result.won) {
      state.setPhase('playing');
      this.grantWallBreak();
      this.activatePower(this.powers.pick(this.rng));
    } else if (godSettings.invincible) {
      state.setPhase('playing');
      this.hud.announce('PERDISTE', 'INVENCIBLE: SIGUES VIVO', ANNOUNCE.bad);
    } else {
      this.lostMinigame = portal.game.name;
      this.die('minigame');
    }
  }

  /**
   * Rompe el muro hacia la dirección pulsada si está bloqueada (p. ej. un lateral
   * del pasillo) o, si no, el que hay delante.
   */
  private useWallBreak(): void {
    const { player, maze } = this;
    const x = player.tileX;
    const y = player.tileY;
    const want = player.wantDir;
    this.hud.pressPowerKey();
    const dir = want !== null && !maze.isOpen(x + DX[want], y + DY[want]) ? want : player.dir;
    const result = this.wallBreaker.tryBreak(maze, x, y, dir);
    if (result.ok) {
      this.shatter.burst(result.tiles, result.dir, this.mazeView.neon.color);
      this.cameraRig.shake(CONFIG.powers.wallBreak.shake);
      this.hud.pulsePower();
      this.state.events.emit('wallBroken', { tiles: result.tiles });
    } else if (result.reason !== 'cooldown') {
      const p = this.toScreen(worldX(result.x), result.y, ACTOR_Z);
      this.popups.fail(p.x, p.y, result.reason === 'no-charges' ? 'SIN ROMPEMUROS' : '');
    }
  }

  private die(cause: DeathCause): void {
    this.player.alive = false;
    this.state.deathCause = cause;
    this.state.setPhase('dying');
    this.playerView.startDeath();
    this.state.events.emit('died', { cause });
  }

  private finish(): void {
    const { state } = this;
    const newRecord = this.usedCheats
      ? { distance: false, score: false }
      : this.ctx.records.submit(GAME_ID, state.meters, state.score);
    if ('distanceRank' in newRecord) this.hud.setRecords(this.ctx.records.get(GAME_ID).topDistances, newRecord.distanceRank);
    this.state.setPhase('over');
    this.hud.setStartHint(false);
    this.gameOver = new GameOverScreen(this.ctx.ui, {
      meters: state.meters,
      score: state.score,
      cause: state.deathCause ?? 'ghost',
      records: this.ctx.records.get(GAME_ID),
      newRecord,
      minigame: this.lostMinigame ?? undefined,
    });
  }

  private updateViews(dt: number): void {
    const { state } = this;
    const dying = state.phase === 'dying' || state.phase === 'over';

    if (state.phase !== 'playing') this.scroll.update(dt, state.meters, this.player.y, 1, false);
    this.cameraRig.update(dt, this.scroll.y);
    this.updateWallColor();
    this.mazeView.update(dt, this.cameraRig.focus.y);
    this.pelletsView.update(dt);
    this.pickupsView.update(dt);
    const playing = this.state.phase === 'playing';
    this.laserView.update(dt, playing ? this.beam : null, this.laser.warning);
    this.magnetEffect.update(dt, this.player, playing && this.magnet.active, this.magnet.warning);
    this.portalsView.update(dt, this.cameraRig.focus.y);
    this.gatesView.update(dt, this.cameraRig.focus.y);

    let scale = this.powers.playerScale;
    let spin = 0;
    if (state.phase === 'portal' && this.entering) {
      const t = Math.min(1, state.phaseTime / this.entering.absorbTime);
      scale *= 1 - t;
      spin = t * t * Math.PI * 4;
    }
    const pose = state.phase === 'cinematic' ? this.cinematic.update(dt, this.cameraRig.camera, this.player) : null;
    if (pose) this.playerView.applyPose(pose, dt);
    else this.playerView.update(dt, this.player, scale, spin, this.powers.ghoulLift + this.iceLift, this.heroLook());
    this.dashTrail.update(dt, this.playerView.mesh, state.phase === 'playing' && this.dash.inDash);
    const fireIceOn = playing && this.powers.active?.id === 'fireIce';
    this.fireIceView.update(dt, this.fireIce, this.maze, playing ? this.flame : null, this.playerView.mesh, fireIceOn, playing && this.sliding);
    this.particles.update(dt);
    this.ghostsView.update(dt, this.ghosts);
    // Como en el clásico, los fantasmas desaparecen durante la animación de muerte.
    this.ghostsView.group.visible = !(dying && (state.phase === 'over' || state.phaseTime > 0.4));
    this.lavaView.update(dt, this.lava);
    this.shatter.update(dt);
    this.smoke.update(dt);
    // Los tentáculos los coloca la cinemática (acto y caída) o, como patas, el poder.
    if (!(pose && this.cinematic.decorated) && (this.powers.active?.id === 'ghoul' || this.legsLanding)) {
      this.drawLegs(1 - this.powers.outro);
    }
    this.tentacles.flush();
    this.hud.setValues(state.meters, state.score);
    this.hud.update(dt);
    // Con un poder especial no se rompen muros: la Z queda en gris o hace la acción del poder.
    const fireIce = this.powers.fireIce;
    const iceKey = fireIce ? { name: 'HIELO', ready: this.fireIce.iceReady } : null;
    this.hud.setPower(this.wallBreaker.charges, godSettings.infiniteWallBreak, !!this.powers.active, iceKey);
    if (fireIce) this.hud.setAction({ name: 'FUEGO', seconds: this.powers.secondsLeft, ready: this.fireIce.fireReady });
    else this.hud.setAction(this.dash.active ? { name: 'DASH', seconds: this.dash.remaining, ready: this.dash.ready } : null);
    const skip = { off: '', win: 'MG GANADOS', lose: 'MG PERDIDOS' }[godSettings.skipMinigames];
    const cheats = [godSettings.invincible && 'INVENCIBLE', godSettings.infiniteWallBreak && 'MURO INF', skip].filter(Boolean);
    this.hud.setGodMode(cheats.length ? `DIOS: ${cheats.join(' · ')} [K]` : '');
    const power = this.powers.active;
    this.hud.setSpecial(power ? this.powers.name(power.id) : null, this.powers.remaining, this.powers.warning, this.powers.secondsLeft, power ? POWER_COLORS[power.id] : '');
  }

  render(): void {
    this.ctx.renderer.render(this.scene, this.cameraRig.camera);
    this.anchorHud();
    this.placePortalLabels();
    this.placeGateLabels();
  }

  /**
   * Color de las paredes según el poder: GHOUL las pone en alerta roja (desde que
   * aterriza); FUEGO HIELO las alterna entre azul hielo y naranja fuego; GIGANTE
   * acelera el cambio de color habitual.
   */
  private updateWallColor(): void {
    const neon = this.mazeView.neon;
    const id = this.powers.active?.id;
    neon.speed = id === 'giant' ? CONFIG.specialPowers.giant.neonSpeed : 1;
    neon.alert = id === 'ghoul' || this.legsLanding ? this.ghoulAlert : id === 'fireIce' ? this.fireIceAlert : null;
  }

  private readonly ghoulAlert = alertColors(CONFIG.specialPowers.ghoul.wallAlert);
  private readonly fireIceAlert = alertColors(CONFIG.specialPowers.fireIce.wallAlert);

  /** Carteles con el nombre del minijuego sobre los portales abiertos. */
  private placePortalLabels(): void {
    const entering = this.entering?.target;
    const items = this.portals.list
      .filter((p) => p.open && !(entering?.kind === 'portal' && entering.portal === p))
      .map((p) => {
        const s = this.toScreen(worldX(p.x), p.y + 1.5, ACTOR_Z);
        return { id: p.id, text: p.game.name, x: s.x, y: s.y };
      });
    this.portalLabels.sync(items);
  }

  /** Cartel del minijuego sobre cada muro portal cerrado (en el centro del muro). */
  private placeGateLabels(): void {
    const items = this.gates.list
      .filter((g) => g.closed)
      .map((g) => {
        const s = this.toScreen(0, gateCenterY(g), CONFIG.maze.wallDepth + 0.3);
        return { id: g.id, text: g.game.name, x: s.x, y: s.y };
      });
    this.gateLabels.sync(items);
  }

  // ---------------------------------------------------------------------------

  /** Proyecta un punto del mundo a píxeles de pantalla. */
  private toScreen(x: number, y: number, z: number): { x: number; y: number } {
    const v = this.projector.set(x, y, z).project(this.cameraRig.camera);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
  }

  private anchorHud(): void {
    const half = CONFIG.maze.width / 2;
    const { focus, halfHeight } = this.cameraRig;
    const y = focus.y - CONFIG.camera.lookAhead;
    const z = CONFIG.maze.wallDepth;
    // Por la perspectiva, el borde del laberinto no está igual de a la derecha arriba
    // que abajo: la columna del HUD empieza en el punto más a la derecha.
    const ys = [y, focus.y + halfHeight, focus.y - halfHeight];
    const right = Math.max(...ys.map((v) => this.toScreen(half, v, z).x));
    const left = Math.min(...ys.map((v) => this.toScreen(-half, v, z).x));
    this.hud.anchor(right, left);
  }

  private scorePopup(amount: number, tileX: number, tileY: number): void {
    const p = this.toScreen(worldX(tileX), tileY, ACTOR_Z);
    this.popups.score(amount, p.x, p.y);
  }

  /** Etiqueta de lo que acaba de pasar, un poco por encima de la casilla para no tapar al protagonista. */
  private tagPopup(text: string, tileX: number, tileY: number, color: string): void {
    const p = this.toScreen(worldX(tileX), tileY + 1.4, ACTOR_Z);
    this.popups.tag(text, p.x, p.y, color);
  }
}
