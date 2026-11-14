import * as THREE from 'three';
import { CONFIG } from '../config';
import type { GameContext } from '../core/Game';
import type { Action } from '../core/Input';
import type { GameMode } from '../core/ModeStack';
import { Rng } from '../core/Rng';
import { CameraRig } from './CameraRig';
import { GhostsView } from './entities/GhostsView';
import { Player } from './entities/Player';
import { PlayerView } from './entities/PlayerView';
import { ShatterEffect } from './effects/ShatterEffect';
import { Maze } from './maze/Maze';
import { MazeView } from './maze/MazeView';
import { DX, DY, Dir } from './maze/grid';
import { AutoScroll } from './systems/AutoScroll';
import { GhostDirector } from './systems/GhostDirector';
import { Lava } from './systems/Lava';
import { LavaView } from './systems/LavaView';
import { PelletType, Pellets } from './systems/Pellets';
import { PelletsView } from './systems/PelletsView';
import { RunState, type DeathCause } from './systems/RunState';
import { WallBreaker } from './systems/WallBreaker';
import { GameOverScreen } from './ui/GameOverScreen';
import { Hud } from './ui/Hud';
import { Popups } from './ui/Popups';
import { ACTOR_Z, worldX } from './world';

export const GAME_ID = 'maze-run';

const DIRECTION_ACTIONS: readonly Action[] = ['up', 'right', 'down', 'left'];
const ACTION_DIR: Record<string, Dir> = { up: Dir.Up, right: Dir.Right, down: Dir.Down, left: Dir.Left };

/**
 * La carrera por el laberinto infinito. Crea y conecta los sistemas
 * (laberinto, puntos, jugador, fantasmas, lava, cámara, interfaz); cada uno
 * vive en su propio módulo y este modo solo coordina el orden de actualización
 * y las reglas que los relacionan (comer, morir, puntuar).
 */
export class MazeRunMode implements GameMode {
  private scene = new THREE.Scene();
  private rng = new Rng();
  readonly state = new RunState();
  readonly maze = new Maze(this.rng);
  private mazeView = new MazeView(this.maze);
  private pellets = new Pellets(this.maze);
  private pelletsView = new PelletsView(this.pellets);
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
  private gameOver: GameOverScreen | null = null;
  /** Herramienta de desarrollo: no se puede morir. Una partida que lo usa no guarda récords. */
  private godMode = false;
  private usedGodMode = false;
  private stopResize: () => void = () => {};
  private projector = new THREE.Vector3();

  constructor(private ctx: GameContext) {}

  enter(): void {
    const { scene } = this;
    scene.background = new THREE.Color(0x03030a);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8), new THREE.HemisphereLight(0xffffff, 0x181020, 0.5));
    scene.add(this.cameraRig.light, this.cameraRig.light.target);
    scene.add(this.mazeView.group, this.pelletsView.group, this.playerView.mesh, this.ghostsView.group, this.lavaView.group, this.shatter.group);

    this.maze.ensureGenerated(this.player.tileY + CONFIG.maze.generateAhead);
    this.cameraRig.snap(this.scroll.y);

    this.hud = new Hud(this.ctx.ui, this.ctx.records.get(GAME_ID));
    this.hud.setMessage('PULSA UNA DIRECCION PARA EMPEZAR', true);
    this.popups = new Popups(this.ctx.ui);
    this.stopResize = this.ctx.renderer.onResize((aspect) => this.cameraRig.setAspect(aspect));

    this.state.events.on('score', (e) => {
      if (e.showPopup) this.popupAt(String(e.amount), e.x, e.y);
    });
  }

  exit(): void {
    this.stopResize();
    this.hud.dispose();
    this.popups.dispose();
    this.gameOver?.dispose();
    this.state.events.clear();
    this.pellets.dispose();
    this.mazeView.dispose();
    this.pelletsView.dispose();
    this.playerView.dispose();
    this.ghostsView.dispose();
    this.lavaView.dispose();
    this.shatter.dispose();
    this.cameraRig.light.dispose();
  }

  /** Otro modo (p. ej. un futuro minijuego) se pone encima: se oculta la interfaz. */
  pause(): void {
    this.hud.setVisible(false);
  }

  resume(): void {
    this.hud.setVisible(true);
  }

  update(dt: number): void {
    const { input } = this.ctx;
    const { state } = this;
    state.phaseTime += dt;

    if (input.pressed('camera')) {
      this.cameraRig.cycleView();
      this.hud.pressViewKey();
    }
    if (CONFIG.dev.godModeKey && input.pressed('god') && (state.phase === 'ready' || state.phase === 'playing')) {
      this.godMode = !this.godMode;
      this.usedGodMode ||= this.godMode;
      this.hud.setGodMode(this.godMode);
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

    this.wallBreaker.update(dt);
    if (input.pressed('power')) this.useWallBreak();

    player.speedMultiplier = state.modifiers.playerSpeed;
    player.update(dt, maze);
    state.reachRow(player.tileY);

    const pellet = this.pellets.eatAt(player.tileX, player.tileY);
    if (pellet?.type === PelletType.Dot) state.addScore(CONFIG.pellets.dotScore, pellet.x, pellet.y);
    if (pellet?.type === PelletType.Energizer) {
      state.addScore(CONFIG.pellets.energizerScore, pellet.x, pellet.y, true);
      state.events.emit('energizer', { duration: this.ghosts.frighten(state.meters) });
    }

    this.ghosts.update(dt, player, state.meters, this.lava.y, state.modifiers.ghostSpeed);
    const hit = this.ghosts.checkPlayer(player);
    for (const { ghost, score } of hit.eaten) state.addScore(score, ghost.x, ghost.y, true);
    if (hit.killed && !this.godMode) return this.die('ghost');

    // El escenario sube solo; la lava persigue el borde inferior de la pantalla (puede quedarse atrás un rato).
    this.scroll.update(dt, state.meters, player.y, state.modifiers.scrollSpeed, true);
    const screenBottom = this.scroll.y - this.cameraRig.halfHeight;
    this.lava.update(dt, state.meters, screenBottom + CONFIG.lava.screenOffset, state.modifiers.lavaSpeed);
    if (this.lava.touches(player.y) && !this.godMode) return this.die('lava');

    maze.ensureGenerated(player.tileY + CONFIG.maze.generateAhead);
    maze.destroyBelow(Math.floor(this.lava.y) - CONFIG.maze.destroyBelowLava);
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
    const newRecord = this.usedGodMode
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
    });
  }

  private updateViews(dt: number): void {
    const { state } = this;
    const dying = state.phase === 'dying' || state.phase === 'over';

    if (state.phase !== 'playing') this.scroll.update(dt, state.meters, this.player.y, 1, false);
    this.cameraRig.update(dt, this.scroll.y);
    this.mazeView.update(dt, this.cameraRig.focus.y);
    this.pelletsView.update(dt);
    this.playerView.update(dt, this.player);
    this.ghostsView.update(dt, this.ghosts);
    // Como en el clásico, los fantasmas desaparecen durante la animación de muerte.
    this.ghostsView.group.visible = !(dying && (state.phase === 'over' || state.phaseTime > 0.4));
    this.lavaView.update(dt, this.lava);
    this.shatter.update(dt);
    this.hud.setValues(state.meters, state.score);
    this.hud.update(dt);
    this.hud.setPower(this.wallBreaker.charges, CONFIG.dev.infinitePowers);
  }

  render(): void {
    this.ctx.renderer.render(this.scene, this.cameraRig.camera);
    this.anchorHud();
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
