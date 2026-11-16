import type { GameContext } from '../../core/Game';
import type { GameMode } from '../../core/ModeStack';
import { MinigameFrame } from '../MinigameFrame';
import type { MinigameResult, MinigameStakes } from '../types';
import { BlocksGame } from './BlocksGame';
import { BlocksScene } from './BlocksScene';
import { BLOCKS_THEMES, type BlocksTheme } from './themes';

/** Tiempo mínimo mostrando el resultado antes de poder saltarlo con Enter o Espacio. */
const MIN_RESULT_TIME = 0.8;
/** Tiempo (s) que se ve el aviso de líneas completas. */
const CLEAR_TEXT_TIME = 0.9;
const CLEAR_TEXTS = ['', '¡LINEA!', '¡DOBLE!', '¡TRIPLE!', '¡CUADRUPLE!'];

/**
 * BLOQUES: piezas de 4 bloques que caen en un pozo 2.5D, en una ventana sobre
 * el laberinto pausado. Lógica en `BlocksGame`, pozo 3D en `BlocksScene` y
 * ventana en `MinigameFrame`.
 *
 * Teclas: ← → mover (se repite al mantener), ↑ o X girar, Z girar al revés,
 * ↓ bajar rápido, Espacio/Enter soltar de golpe.
 *
 * Según la entrada (`stakes.kind`): en un muro portal hay que hacer 2 líneas
 * y se ve con los colores del laberinto; en un portal de poder especial,
 * 5 líneas, cae algo más rápido y todo es rojizo, con los avisos en llamas.
 */
export class BlocksMode implements GameMode {
  readonly overlay = true;
  private readonly theme: BlocksTheme;
  private readonly game: BlocksGame;
  private readonly frame: MinigameFrame;
  private scene: BlocksScene | null = null;
  private labels: { next: HTMLElement; lines: HTMLElement } | null = null;
  private repeatDir = 0;
  private repeatTimer = 0;
  private seenClears = 0;
  private clearText = '';
  private clearTextTime = 0;

  constructor(
    private ctx: GameContext,
    private done: (result: MinigameResult) => void,
    private stakes: MinigameStakes,
  ) {
    this.theme = BLOCKS_THEMES[stakes.kind];
    this.game = new BlocksGame(stakes.kind);
    this.frame = new MinigameFrame(ctx, { title: 'BLOQUES', hard: this.theme.hard, aspect: 1.25, maxHeight: 0.7, textBase: 180 });
  }

  enter(): void {
    this.scene = new BlocksScene(this.frame.canvas, this.game, this.theme);
    const label = (text: string) => {
      const el = document.createElement('div');
      el.className = 'mg-label';
      el.textContent = text;
      this.frame.screen.appendChild(el);
      return el;
    };
    this.labels = { next: label('SIGUIENTE'), lines: label('LINEAS') };
    this.frame.mount((w, h) => {
      this.scene?.setSize(w, h);
      this.placeLabels();
    });
  }

  exit(): void {
    this.scene?.dispose();
    this.scene = null;
    this.frame.unmount();
  }

  /** Coloca las etiquetas y centra los avisos sobre el pozo (según dónde se ve en pantalla). */
  private placeLabels(): void {
    if (!this.scene || !this.labels) return;
    const a = this.scene.anchors();
    const pos = (el: HTMLElement, p: { x: number; y: number }) => {
      el.style.left = `${(p.x * 100).toFixed(2)}%`;
      el.style.top = `${(p.y * 100).toFixed(2)}%`;
    };
    pos(this.labels.next, a.next);
    pos(this.labels.lines, a.lines);
    this.frame.root.style.setProperty('--mg-text-x', `${(a.well.x * 100).toFixed(2)}%`);
  }

  update(dt: number): void {
    const { input } = this.ctx;
    const { game, frame } = this;
    frame.update(dt);
    this.scene?.update(dt);
    this.placeLabels();
    if (frame.isClosing) return;

    game.update(dt, {
      move: this.horizontal(dt),
      rotate: input.pressed('up') || input.pressed('action') ? 1 : input.pressed('power') ? -1 : 0,
      soft: input.isHeld('down'),
      drop: game.phase === 'play' && input.pressed('confirm'),
    });
    this.react(dt);
    this.updateTexts();

    if (game.phase === 'over') {
      const t = game.phaseTime;
      if (t >= game.cfg.resultTime || (t >= MIN_RESULT_TIME && input.pressed('confirm'))) {
        const won = !!game.won;
        frame.close(won, () => {
          this.ctx.modes.pop();
          this.done({ won });
        });
      }
    }
  }

  /** ← →: un paso al pulsar y, si se mantiene, repetición tras un pequeño retardo. */
  private horizontal(dt: number): number {
    const { input } = this.ctx;
    const { repeatDelay, repeatRate } = this.game.cfg;
    const held = input.latestHeld(['left', 'right']);
    const dir = held === 'left' ? -1 : held === 'right' ? 1 : 0;
    if (dir === 0) {
      this.repeatDir = 0;
      return 0;
    }
    if (dir !== this.repeatDir) {
      this.repeatDir = dir;
      this.repeatTimer = -repeatDelay;
      return dir;
    }
    this.repeatTimer += dt;
    if (this.repeatTimer >= repeatRate) {
      this.repeatTimer -= repeatRate;
      return dir;
    }
    return 0;
  }

  /** Empujones de la ventana al soltar piezas y al hacer líneas. */
  private react(dt: number): void {
    const { game, frame } = this;
    if (game.clears !== this.seenClears) {
      this.seenClears = game.clears;
      const n = game.lastClear;
      this.clearText = CLEAR_TEXTS[Math.min(4, n)];
      this.clearTextTime = CLEAR_TEXT_TIME;
      frame.kick((Math.random() < 0.5 ? -1 : 1) * (1 + n * 0.6), 0.05 + n * 0.03);
      frame.shake(2 + n * 1.5, 0.3);
      frame.flash();
    }
    if (game.hardDrops !== this.lastHardDrops) {
      this.lastHardDrops = game.hardDrops;
      frame.kick(0, 0.03);
      frame.shake(2.5, 0.18);
    }
    this.clearTextTime = Math.max(0, this.clearTextTime - dt);
  }
  private lastHardDrops = 0;

  private updateTexts(): void {
    const { game, frame } = this;
    const hard = this.theme.hard;
    switch (game.phase) {
      case 'over': {
        const won = !!game.won;
        frame.showBig(won ? '¡HAS GANADO!' : 'HAS PERDIDO', { tone: won ? 'good' : 'bad', strong: true, fire: hard, burst: won });
        frame.setSmall(won ? this.stakes.wonText : this.stakes.lostText);
        return;
      }
    }
    frame.setSmall('');
    if (this.clearTextTime > 0) {
      // En el portal difícil, los avisos de líneas salen en llamas.
      frame.showBig(this.clearText, { tone: 'good', strong: game.lastClear >= 2, fire: hard });
    } else {
      frame.showBig('');
    }
  }

  render(): void {
    this.scene?.render();
  }
}
