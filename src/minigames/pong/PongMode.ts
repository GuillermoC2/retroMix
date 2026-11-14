import type { GameContext } from '../../core/Game';
import type { GameMode } from '../../core/ModeStack';
import type { MinigameResult } from '../types';
import { BALL_HALF, COURT_LINE, PADDLE_INSET, PADDLE_WIDTH, PongGame } from './PongGame';

const COLORS = {
  bg: '#05051a',
  line: '#c4c8f4',
  net: '#3a3f7a',
  player: '#ffd51a',
  ai: '#ff2e6d',
  ball: '#ffffff',
  trail: 'rgba(255,255,255,0.25)',
};

/** Cifras de 3×5 píxeles para el marcador (dibujadas a mano, como en las recreativas). */
const DIGITS = [
  '111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111',
];
const DIGIT_SCALE = 3;
/** Tiempo mínimo mostrando el resultado antes de poder saltarlo con Enter o Espacio. */
const MIN_RESULT_TIME = 0.8;
const TRAIL = 4;

/**
 * Pong en una ventana sobre el laberinto pausado. La lógica está en `PongGame`;
 * aquí van la ventana, el dibujo (canvas a baja resolución escalado sin
 * suavizado) y el teclado. W/S o flechas mueven la pala.
 */
export class PongMode implements GameMode {
  readonly overlay = true;
  private game = new PongGame();
  private root = document.createElement('div');
  private screen = document.createElement('div');
  private canvas = document.createElement('canvas');
  private g = this.canvas.getContext('2d')!;
  private bigText = document.createElement('div');
  private smallText = document.createElement('div');
  private trail: Array<{ x: number; y: number }> = [];
  private lastHits = 0;
  private lastScore = 0;
  private finished = false;
  private readonly onResize = () => this.fit();

  constructor(
    private ctx: GameContext,
    private done: (result: MinigameResult) => void,
  ) {}

  enter(): void {
    const { width, height, pointsToWin } = this.game.cfg;
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.className = 'mg-canvas';
    this.root.className = 'mg-overlay';
    this.root.innerHTML = `
      <div class="mg-window">
        <div class="mg-titlebar">
          <span class="mg-side mg-you">TU</span>
          <span class="mg-title">PONG</span>
          <span class="mg-side mg-rival">RIVAL</span>
        </div>
        <div class="mg-footer">
          <div><span class="key">W</span><span class="key">S</span> O FLECHAS: MOVER</div>
          <div class="mg-stakes">PRIMERO A ${pointsToWin} · GANA: PODER ESPECIAL · PIERDE: FIN DE LA PARTIDA</div>
        </div>
      </div>`;
    this.screen.className = 'mg-screen';
    this.bigText.className = 'mg-big';
    this.smallText.className = 'mg-small';
    this.screen.append(this.canvas, this.bigText, this.smallText);
    this.root.querySelector('.mg-titlebar')!.after(this.screen);
    this.ctx.ui.appendChild(this.root);
    window.addEventListener('resize', this.onResize);
    this.fit();
  }

  exit(): void {
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
  }

  update(dt: number): void {
    const { input } = this.ctx;
    const { game } = this;
    const held = input.latestHeld(['up', 'down']);
    game.update(dt, held === 'up' ? -1 : held === 'down' ? 1 : 0);

    if (game.phase === 'play') {
      this.trail.push({ x: game.ball.x, y: game.ball.y });
      if (this.trail.length > TRAIL) this.trail.shift();
    } else {
      this.trail.length = 0;
    }
    if (game.hits !== this.lastHits) {
      this.lastHits = game.hits;
      this.bump('mg-hit');
    }
    const scored = game.score.player + game.score.ai;
    if (scored !== this.lastScore) {
      this.lastScore = scored;
      this.bump(game.lastPoint === 'player' ? 'mg-scored' : 'mg-conceded');
    }
    this.updateTexts();

    if (game.phase === 'over' && !this.finished) {
      const t = game.phaseTime;
      if (t >= game.cfg.resultTime || (t >= MIN_RESULT_TIME && input.pressed('confirm'))) this.finish();
    }
  }

  private finish(): void {
    this.finished = true;
    const won = this.game.winner === 'player';
    this.ctx.modes.pop();
    this.done({ won });
  }

  private updateTexts(): void {
    const { game } = this;
    let big = '';
    let small = '';
    let tone = '';
    switch (game.phase) {
      case 'countdown':
        big = String(Math.max(1, Math.ceil(game.cfg.countdown - game.phaseTime)));
        small = `PRIMERO A ${game.cfg.pointsToWin} PUNTOS`;
        break;
      case 'play':
        if (game.phaseTime < 0.45 && game.score.player + game.score.ai === 0) big = '¡YA!';
        break;
      case 'point':
        big = game.lastPoint === 'player' ? '¡PUNTO!' : 'PUNTO RIVAL';
        tone = game.lastPoint === 'player' ? 'good' : 'bad';
        break;
      case 'over': {
        const won = game.winner === 'player';
        big = won ? '¡HAS GANADO!' : 'HAS PERDIDO';
        small = won ? 'TE LLEVAS UN PODER ESPECIAL' : 'FIN DE LA PARTIDA';
        tone = won ? 'good' : 'bad';
        break;
      }
    }
    if (this.bigText.textContent !== big) {
      this.bigText.textContent = big;
      this.bigText.dataset.tone = tone;
      this.bump('mg-pop', this.bigText);
    }
    if (this.smallText.textContent !== small) this.smallText.textContent = small;
  }

  /** Reinicia una animación CSS de un solo uso. */
  private bump(className: string, el: HTMLElement = this.screen): void {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  /** Escala entera del campo para que los píxeles sean nítidos. */
  private fit(): void {
    const { width, height } = this.game.cfg;
    const scale = Math.max(1, Math.floor(Math.min((window.innerWidth * 0.7) / width, (window.innerHeight * 0.6) / height)));
    this.canvas.style.width = `${width * scale}px`;
    this.canvas.style.height = `${height * scale}px`;
    this.root.style.setProperty('--mg-scale', String(scale));
  }

  render(): void {
    const { g, game } = this;
    const { width: W, height: H, paddleHeight } = game.cfg;
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, W, H);

    // Líneas de fondo y red discontinua.
    g.fillStyle = COLORS.line;
    g.fillRect(0, 0, W, COURT_LINE);
    g.fillRect(0, H - COURT_LINE, W, COURT_LINE);
    g.fillStyle = COLORS.net;
    for (let y = COURT_LINE + 2; y < H - COURT_LINE; y += 8) g.fillRect(W / 2 - 1, y, 2, 4);

    // Marcador.
    this.drawNumber(game.score.player, W / 2 - 8 - 3 * DIGIT_SCALE, 8, COLORS.player);
    this.drawNumber(game.score.ai, W / 2 + 8, 8, COLORS.ai);

    // Palas.
    const half = paddleHeight / 2;
    g.fillStyle = COLORS.player;
    g.fillRect(PADDLE_INSET, Math.round(game.playerY - half), PADDLE_WIDTH, paddleHeight);
    g.fillStyle = COLORS.ai;
    g.fillRect(W - PADDLE_INSET - PADDLE_WIDTH, Math.round(game.aiY - half), PADDLE_WIDTH, paddleHeight);

    // Bola con estela corta (solo en juego).
    if (game.phase === 'play') {
      const size = BALL_HALF * 2;
      g.fillStyle = COLORS.trail;
      for (const p of this.trail.slice(0, -1)) g.fillRect(Math.round(p.x - BALL_HALF), Math.round(p.y - BALL_HALF), size, size);
      g.fillStyle = COLORS.ball;
      g.fillRect(Math.round(game.ball.x - BALL_HALF), Math.round(game.ball.y - BALL_HALF), size, size);
    }
  }

  private drawNumber(n: number, x: number, y: number, color: string): void {
    const bits = DIGITS[Math.min(9, n)];
    this.g.fillStyle = color;
    for (let i = 0; i < 15; i++) {
      if (bits[i] === '1') this.g.fillRect(x + (i % 3) * DIGIT_SCALE, y + Math.floor(i / 3) * DIGIT_SCALE, DIGIT_SCALE, DIGIT_SCALE);
    }
  }
}
