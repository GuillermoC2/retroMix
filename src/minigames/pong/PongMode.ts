import { CONFIG } from '../../config';
import type { GameContext } from '../../core/Game';
import type { GameMode } from '../../core/ModeStack';
import { MinigameFrame } from '../MinigameFrame';
import type { MinigameResult, MinigameStakes } from '../types';
import { PongGame, type PongSide } from './PongGame';
import { PongScene } from './PongScene';
import { PONG_THEMES, type PongTheme } from './themes';

/** Tiempo mínimo mostrando el resultado antes de poder saltarlo con Enter o Espacio. */
const MIN_RESULT_TIME = 0.8;

/**
 * Pong 2.5D en una ventana sobre el laberinto pausado. La lógica está en
 * `PongGame`, la pista 3D en `PongScene` y la ventana animada en
 * `MinigameFrame`; aquí van el teclado y las reacciones a los eventos.
 *
 * Según la entrada (`stakes.kind`): en un muro portal gana el primer punto y
 * se ve con los colores del laberinto; en un portal de poder especial hacen
 * falta 3 puntos y todo es rojizo, con brasas y los avisos de punto en llamas.
 */
export class PongMode implements GameMode {
  readonly overlay = true;
  private readonly theme: PongTheme;
  private readonly game: PongGame;
  private readonly frame: MinigameFrame;
  private scene: PongScene | null = null;
  private lastHits = 0;
  private lastScore = 0;

  constructor(
    private ctx: GameContext,
    private done: (result: MinigameResult) => void,
    private stakes: MinigameStakes,
  ) {
    this.theme = PONG_THEMES[stakes.kind];
    this.game = new PongGame(CONFIG.minigames.pong.pointsToWin[stakes.kind]);
    this.frame = new MinigameFrame(ctx, {
      title: 'PONG',
      hard: this.theme.hard,
      left: 'TU',
      right: 'RIVAL',
      // La pista se ve en perspectiva y pide algo más de ancho.
      aspect: 1.6,
      textBase: this.game.width,
    });
  }

  enter(): void {
    this.scene = new PongScene(this.frame.canvas, this.game, this.theme);
    this.frame.mount((w, h) => this.scene?.setSize(w, h));
  }

  exit(): void {
    this.scene?.dispose();
    this.scene = null;
    this.frame.unmount();
  }

  update(dt: number): void {
    const { input } = this.ctx;
    const { game, frame } = this;
    frame.update(dt);
    this.scene?.update(dt);
    if (frame.isClosing) return;

    const held = input.latestHeld(['up', 'down']);
    game.update(dt, held === 'up' ? -1 : held === 'down' ? 1 : 0);

    if (game.hits !== this.lastHits) {
      this.lastHits = game.hits;
      // Tras el golpe la bola ya va hacia el otro lado.
      const side: PongSide = game.ball.vx > 0 ? 'player' : 'ai';
      this.scene?.hit(side);
      frame.kick(side === 'player' ? 0.5 : -0.5, 0.015);
      frame.flash();
    }
    const scored = game.score.player + game.score.ai;
    if (scored !== this.lastScore) {
      this.lastScore = scored;
      const by = game.lastPoint!;
      this.scene?.point(by);
      frame.kick(by === 'player' ? -2.5 : 2.5, 0.12);
      frame.shake(this.theme.hard ? 6 : 4, 0.35);
    }
    this.updateTexts();

    if (game.phase === 'over') {
      const t = game.phaseTime;
      if (t >= game.cfg.resultTime || (t >= MIN_RESULT_TIME && input.pressed('confirm'))) {
        const won = game.winner === 'player';
        frame.close(won, () => {
          this.ctx.modes.pop();
          this.done({ won });
        });
      }
    }
  }

  private updateTexts(): void {
    const { game, frame } = this;
    const hard = this.theme.hard;
    switch (game.phase) {
      // Sin cuenta atrás: la espera inicial no muestra nada.
      case 'ready':
      case 'play':
        frame.showBig('');
        frame.setSmall('');
        break;
      case 'point': {
        // En el portal difícil, los avisos de quién ha marcado salen en llamas.
        const mine = game.lastPoint === 'player';
        frame.showBig(mine ? '¡PUNTO!' : 'PUNTO RIVAL', { tone: mine ? 'good' : 'bad', strong: true, fire: hard });
        break;
      }
      case 'over': {
        const won = game.winner === 'player';
        frame.showBig(won ? '¡HAS GANADO!' : 'HAS PERDIDO', { tone: won ? 'good' : 'bad', strong: true, fire: hard, burst: won });
        frame.setSmall(won ? this.stakes.wonText : this.stakes.lostText);
        break;
      }
    }
  }

  render(): void {
    this.scene?.render();
  }
}
