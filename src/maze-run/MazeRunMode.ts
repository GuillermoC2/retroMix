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
import { SmokeEffect } from './effects/SmokeEffect';
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
import { SpecialPowers } from './systems/SpecialPowers';
import { RunState, type DeathCause } from './systems/RunState';
import { WallBreaker } from './systems/WallBreaker';
import { GameOverScreen } from './ui/GameOverScreen';
import { Hud } from './ui/Hud';
import { Popups } from './ui/Popups';
import { PortalLabels } from './ui/PortalLabels';
import type { MinigameResult } from '../minigames/types';
import type { Passable } from './entities/Player';
import { GodMenuMode, type GodMenuAction, type GodMenuToggle } from './dev/GodMenuMode';
import { anyCheat, godSettings, saveGodSettings } from './dev/GodSettings';
import { ACTOR_Z, worldX } from './world';
import { HERO_DIAMETER } from './entities/sprites';

export const GAME_ID = 'maze-run';

const DIRECTION_ACTIONS: readonly Action[] = ['up', 'right', 'down', 'left'];
const ACTION_DIR: Record<string, Dir> = { up: Dir.Up, right: Dir.Right, down: Dir.Down, left: Dir.Left };

/**
 * La carrera por el laberinto infinito. Crea y conecta los sistemas
 * (laberinto, puntos, jugador, fantasmas, lava, cámara, interfaz); cada uno
 * vive en su propio módulo y este modo solo coordina el orden de actualización
 * y las reglas que los relacionan (comer, morir, puntuar).
 *
 * Portales: al pisar uno, el jugador es absorbido (fase `portal`) y se apila el
 * minijuego encima (este modo queda en pausa). Al volver se aplica el resultado:
 * ganar activa un poder especial aleatorio; perder acaba la partida.
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
  private powers = new SpecialPowers();
  private cinematic = new PowerCinematic();
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
  /** Portal por el que se está entrando (animación de absorción y minijuego en curso). */
  private entering: { portal: Portal; fromX: number; fromY: number; launched: boolean } | null = null;
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
    scene.add(this.mazeView.group, this.pelletsView.group, this.playerView.mesh, this.ghostsView.group, this.lavaView.group, this.shatter.group, this.portalsView.group, this.cinematic.group, this.smoke.group);

    this.maze.ensureGenerated(this.player.tileY + CONFIG.maze.generateAhead);
    this.cameraRig.snap(this.scroll.y);

    this.hud = new Hud(this.ctx.ui, this.ctx.records.get(GAME_ID));
    this.hud.setMessage('PULSA UNA DIRECCION PARA EMPEZAR', true);
    this.popups = new Popups(this.ctx.ui);
    this.portalLabels = new PortalLabels(this.ctx.ui);
    this.stopResize = this.ctx.renderer.onResize((aspect) => this.cameraRig.setAspect(aspect));

    this.state.events.on('score', (e) => {
      if (e.showPopup) this.popupAt(String(e.amount), e.x, e.y);
    });
  }

  exit(): void {
    this.stopResize();
    this.hud.dispose();
    this.popups.dispose();
    this.portalLabels.dispose();
    this.gameOver?.dispose();
    this.state.events.clear();
    this.pellets.dispose();
    this.portals.dispose();
    this.portalsView.dispose();
    this.mazeView.dispose();
    this.pelletsView.dispose();
    this.playerView.dispose();
    this.ghostsView.dispose();
    this.lavaView.dispose();
    this.shatter.dispose();
    this.cinematic.dispose();
    this.smoke.dispose();
    this.cameraRig.light.dispose();
  }

  /** Otro modo (un minijuego) se pone encima: se oculta la interfaz. */
  pause(): void {
    this.hud.setVisible(false);
    this.portalLabels.setVisible(false);
  }

  resume(): void {
    this.hud.setVisible(true);
    this.portalLabels.setVisible(true);
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
      this.ctx.modes.push(new GodMenuMode(this.ctx, this.godToggles(), this.godPowerActions()));
      return;
    }

    switch (state.phase) {
      case 'ready': {
        const action = DIRECTION_ACTIONS.find((a) => input.pressed(a));
        if (action) {
          this.player.wantDir = ACTION_DIR[action];
          this.hud.setMessage('');
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
    if (input.pressed('power')) this.useWallBreak();

    const ended = this.powers.update(dt);
    if (ended) state.events.emit('specialPower', { id: ended, active: false });
    const giant = this.powers.giant;

    player.speedMultiplier = state.modifiers.playerSpeed * (giant ? CONFIG.specialPowers.giant.speed : 1);
    player.update(dt, maze, giant ? this.giantPassable : undefined);
    state.reachRow(player.tileY);

    if (giant) this.giantEat();
    else this.eatPelletAt(player.tileX, player.tileY);

    const portal = this.portals.touching(player.x, player.y);
    if (portal) return this.enterPortal(portal);

    this.ghosts.update(dt, player, state.meters, this.lava.y, state.modifiers.ghostSpeed);
    if (giant) {
      const radius = CONFIG.ghosts.hitRadius + CONFIG.specialPowers.giant.reach - 0.5;
      for (const { ghost, score } of this.ghosts.devour(player, radius)) state.addScore(score, ghost.x, ghost.y, true);
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
  }

  private eatPelletAt(x: number, y: number): void {
    const { state } = this;
    const pellet = this.pellets.eatAt(x, y);
    if (pellet?.type === PelletType.Dot) state.addScore(CONFIG.pellets.dotScore, pellet.x, pellet.y);
    if (pellet?.type === PelletType.Energizer) {
      state.addScore(CONFIG.pellets.energizerScore, pellet.x, pellet.y, true);
      state.events.emit('energizer', { duration: this.ghosts.frighten(state.meters) });
    }
  }

  // ---------------------------------------------------------------------------
  // Poder GIGANTE
  // ---------------------------------------------------------------------------

  /** El gigante puede entrar en muros, salvo en el borde exterior y en la columna pegada a él. */
  private readonly giantPassable: Passable = (x, y) =>
    this.maze.isOpen(x, y) || (this.maze.tile(x, y) !== undefined && x >= 2 && x <= this.maze.width - 3);

  /** Come muros y puntos alrededor de su centro (≈ 3×3 casillas). El borde exterior no se come. */
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
  // Portales y minijuegos
  // ---------------------------------------------------------------------------

  private enterPortal(portal: Portal): void {
    this.entering = { portal, fromX: this.player.x, fromY: this.player.y, launched: false };
    this.portalsView.absorbing = portal;
    this.state.setPhase('portal');
    this.state.events.emit('portalEntered', { game: portal.game.id });
  }

  /** Absorción: el jugador va al centro del portal girando y encogiendo; luego se abre el minijuego. */
  private updatePortal(): void {
    const e = this.entering;
    if (!e || e.launched) return;
    const t = Math.min(1, this.state.phaseTime / CONFIG.portals.absorbTime);
    this.player.x = e.fromX + (e.portal.x - e.fromX) * t;
    this.player.y = e.fromY + (e.portal.y - e.fromY) * t;
    if (t < 1) return;
    e.launched = true;
    this.portals.close(e.portal);
    this.portalsView.absorbing = null;
    const { portal } = e;
    this.ctx.modes.push(portal.game.create(this.ctx, (result) => this.onMinigameDone(portal, result)));
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
    this.cinematic.play(id, this.player, this.powers.playerScale, (amount) => this.cameraRig.shake(amount), {
      onImpact: (at, scale) => {
        this.cameraRig.shake(impactShake);
        // Por encima de los muros, para que no lo tapen.
        this.smoke.ring(at.x, at.y, CONFIG.maze.wallDepth + 0.15, (HERO_DIAMETER / 2) * scale + 0.2, smokePuffs);
      },
      onDone: () => {
        state.setPhase(this.phaseAfterCinematic);
        this.powers.activate(id);
        this.ghosts.resetCombo();
        this.hud.announce(`¡${this.powers.name(id)}!`, 'PODER ESPECIAL');
        state.events.emit('specialPower', { id, active: true });
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Modo dios (desarrollo)
  // ---------------------------------------------------------------------------

  /** Trucos del menú de la tecla K (se recuerdan entre partidas). */
  private godToggles(): GodMenuToggle[] {
    const yesNo = (on: boolean) => (on ? 'SI' : 'NO');
    const setting = (label: string, key: keyof typeof godSettings): GodMenuToggle => ({
      label,
      value: () => yesNo(godSettings[key]),
      toggle: () => {
        godSettings[key] = !godSettings[key];
        saveGodSettings();
        this.usedCheats ||= godSettings[key];
      },
    });
    return [setting('INVENCIBLE', 'invincible'), setting('ROMPER MURO INFINITO', 'infiniteWallBreak')];
  }

  /** Poderes especiales del menú: al hacer clic se cierra el menú y se lanza (con su cinemática) o se quita. */
  private godPowerActions(): GodMenuAction[] {
    const isActive = (id: SpecialPowerId) => this.powers.active?.id === id && this.powers.remaining > 0;
    return CONFIG.specialPowers.pool.map((id) => ({
      label: this.powers.name(id),
      button: () => (isActive(id) ? 'ACTIVO: QUITAR' : 'ACTIVAR'),
      run: () => {
        this.usedCheats = true;
        if (isActive(id)) this.powers.deactivate();
        else this.activatePower(id);
      },
    }));
  }

  /** Vuelta del minijuego (este modo ya se ha reanudado). */
  private onMinigameDone(portal: Portal, result: MinigameResult): void {
    const { state } = this;
    this.entering = null;
    state.events.emit('minigameResult', { game: portal.game.id, won: result.won });
    if (result.won) {
      state.setPhase('playing');
      this.activatePower(this.powers.pick(this.rng));
    } else if (godSettings.invincible) {
      state.setPhase('playing');
      this.hud.announce('PERDISTE', 'INVENCIBLE: SIGUES VIVO');
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
      this.popupAt('X', result.x, result.y, 'fail');
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
    this.state.setPhase('over');
    this.hud.setMessage('');
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
    this.mazeView.update(dt, this.cameraRig.focus.y);
    this.pelletsView.update(dt);
    this.portalsView.update(dt, this.cameraRig.focus.y);

    let scale = this.powers.playerScale;
    let spin = 0;
    if (state.phase === 'portal') {
      const t = Math.min(1, state.phaseTime / CONFIG.portals.absorbTime);
      scale *= 1 - t;
      spin = t * t * Math.PI * 4;
    }
    const pose = state.phase === 'cinematic' ? this.cinematic.update(dt, this.cameraRig.camera, this.player) : null;
    if (pose) this.playerView.applyPose(pose);
    else this.playerView.update(dt, this.player, scale, spin);
    this.ghostsView.update(dt, this.ghosts);
    // Como en el clásico, los fantasmas desaparecen durante la animación de muerte.
    this.ghostsView.group.visible = !(dying && (state.phase === 'over' || state.phaseTime > 0.4));
    this.lavaView.update(dt, this.lava);
    this.shatter.update(dt);
    this.smoke.update(dt);
    this.hud.setValues(state.meters, state.score);
    this.hud.update(dt);
    this.hud.setPower(this.wallBreaker.charges, godSettings.infiniteWallBreak);
    const cheats = [godSettings.invincible && 'INVENCIBLE', godSettings.infiniteWallBreak && 'MURO INF'].filter(Boolean);
    this.hud.setGodMode(cheats.length ? `DIOS: ${cheats.join(' · ')} [K]` : '');
    const power = this.powers.active;
    this.hud.setSpecial(power ? this.powers.name(power.id) : null, this.powers.remaining, this.powers.warning);
  }

  render(): void {
    this.ctx.renderer.render(this.scene, this.cameraRig.camera);
    this.anchorHud();
    this.placePortalLabels();
  }

  /** Carteles con el nombre del minijuego sobre los portales abiertos. */
  private placePortalLabels(): void {
    const items = this.portals.list
      .filter((p) => p.open && this.entering?.portal !== p)
      .map((p) => {
        const s = this.toScreen(worldX(p.x), p.y + 1.5, ACTOR_Z);
        return { id: p.id, text: p.game.name, x: s.x, y: s.y };
      });
    this.portalLabels.sync(items);
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
    const right = Math.max(
      this.toScreen(half, y, z).x,
      this.toScreen(half, focus.y + halfHeight, z).x,
      this.toScreen(half, focus.y - halfHeight, z).x,
    );
    this.hud.anchor(right);
  }

  private popupAt(text: string, tileX: number, tileY: number, className = ''): void {
    const p = this.toScreen(worldX(tileX), tileY, ACTOR_Z);
    this.popups.show(text, p.x, p.y, className);
  }
}
