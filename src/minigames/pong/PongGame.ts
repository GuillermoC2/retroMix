import { CONFIG } from '../../config';

export type PongPhase = 'ready' | 'play' | 'point' | 'over';
export type PongSide = 'player' | 'ai';

/** Grosor de las líneas de fondo (arriba y abajo) y de las palas, en píxeles lógicos. */
export const COURT_LINE = 2;
export const PADDLE_WIDTH = 3;
/** Distancia de cada pala a su borde y media anchura de la bola. */
export const PADDLE_INSET = 6;
export const BALL_HALF = 1.5;

const DEG = Math.PI / 180;

/**
 * Lógica del Pong, sin nada de dibujo ni de teclado: el jugador maneja la pala
 * izquierda y la IA la derecha. Coordenadas en píxeles lógicos con Y hacia abajo.
 */
export class PongGame {
  readonly cfg = CONFIG.minigames.pong;
  readonly width = this.cfg.width;
  readonly height = this.cfg.height;
  phase: PongPhase = 'ready';
  phaseTime = 0;
  /** Centro vertical de cada pala. */
  playerY = this.height / 2;
  aiY = this.height / 2;
  readonly ball = { x: this.width / 2, y: this.height / 2, vx: 0, vy: 0, speed: 0 };
  readonly score = { player: 0, ai: 0 };
  winner: PongSide | null = null;
  lastPoint: PongSide | null = null;
  /** Golpes de pala (para efectos de la vista). */
  hits = 0;
  private aiAim = 0;

  /** @param pointsToWin puntos que necesita cada lado para ganar (según la entrada, ver `CONFIG.minigames.pong.pointsToWin`). */
  constructor(
    readonly pointsToWin: Readonly<Record<PongSide, number>>,
    private random: () => number = Math.random,
  ) {}

  get top(): number {
    return COURT_LINE;
  }

  get bottom(): number {
    return this.height - COURT_LINE;
  }

  /** Cara interior de cada pala (donde rebota la bola). */
  get playerFace(): number {
    return PADDLE_INSET + PADDLE_WIDTH;
  }

  get aiFace(): number {
    return this.width - PADDLE_INSET - PADDLE_WIDTH;
  }

  /** @param move -1 sube, 1 baja, 0 quieto (pala del jugador). */
  update(dt: number, move: number): void {
    this.phaseTime += dt;
    if (this.phase === 'over') return;
    this.playerY = this.clampPaddle(this.playerY + move * this.cfg.paddleSpeed * dt);
    this.updateAi(dt);

    switch (this.phase) {
      case 'ready':
        if (this.phaseTime >= this.cfg.startDelay) this.serve('ai');
        break;
      case 'point':
        if (this.phaseTime >= this.cfg.pointPause) this.serve(this.lastPoint === 'player' ? 'ai' : 'player');
        break;
      case 'play':
        this.moveBall(dt);
        break;
    }
  }

  private setPhase(phase: PongPhase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }

  /** Saca desde el centro hacia `towards`, con un ángulo aleatorio suave. */
  private serve(towards: PongSide): void {
    const b = this.ball;
    const angle = (this.random() * 2 - 1) * 25 * DEG;
    const sign = towards === 'player' ? -1 : 1;
    b.x = this.width / 2;
    b.y = this.height / 2;
    b.speed = this.cfg.ballSpeed;
    b.vx = Math.cos(angle) * b.speed * sign;
    b.vy = Math.sin(angle) * b.speed;
    this.newAim();
    this.setPhase('play');
  }

  private moveBall(dt: number): void {
    const b = this.ball;
    const prevX = b.x;
    const prevY = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Rebote en las líneas de fondo.
    const minY = this.top + BALL_HALF;
    const maxY = this.bottom - BALL_HALF;
    if (b.y < minY) {
      b.y = 2 * minY - b.y;
      b.vy = Math.abs(b.vy);
    } else if (b.y > maxY) {
      b.y = 2 * maxY - b.y;
      b.vy = -Math.abs(b.vy);
    }

    // Palas: se comprueba el cruce de su cara (barrido) para que la bola rápida no las atraviese.
    const left = this.playerFace + BALL_HALF;
    const right = this.aiFace - BALL_HALF;
    if (b.vx < 0 && prevX >= left && b.x < left) this.tryHit('player', left, prevX, prevY);
    else if (b.vx > 0 && prevX <= right && b.x > right) this.tryHit('ai', right, prevX, prevY);

    if (b.x < -BALL_HALF * 2) this.point('ai');
    else if (b.x > this.width + BALL_HALF * 2) this.point('player');
  }

  private tryHit(side: PongSide, faceX: number, prevX: number, prevY: number): void {
    const b = this.ball;
    const t = (faceX - prevX) / (b.x - prevX);
    const yAt = prevY + (b.y - prevY) * t;
    const paddleY = side === 'player' ? this.playerY : this.aiY;
    const reach = this.cfg.paddleHeight / 2 + BALL_HALF;
    if (Math.abs(yAt - paddleY) > reach) return;

    // El ángulo de salida depende de dónde golpea la bola en la pala (como en el original).
    const offset = (yAt - paddleY) / reach;
    const angle = offset * this.cfg.maxBounceAngle * DEG;
    b.speed = Math.min(this.cfg.ballMaxSpeed, b.speed * this.cfg.ballSpeedUp);
    const sign = side === 'player' ? 1 : -1;
    b.vx = Math.cos(angle) * b.speed * sign;
    b.vy = Math.sin(angle) * b.speed;
    b.x = faceX;
    b.y = yAt;
    this.hits++;
    this.newAim();
  }

  private point(by: PongSide): void {
    this.score[by]++;
    this.lastPoint = by;
    if (this.score[by] >= this.pointsToWin[by]) {
      this.winner = by;
      this.setPhase('over');
    } else {
      this.setPhase('point');
    }
  }

  // ---------------------------------------------------------------------------
  // IA: predice dónde llegará la bola (con rebotes) y va hacia allí con velocidad
  // limitada y un pequeño error de puntería que cambia en cada golpe.
  // ---------------------------------------------------------------------------

  private updateAi(dt: number): void {
    const b = this.ball;
    let target = this.height / 2;
    // Solo reacciona cuando la bola viene hacia ella y ha pasado cierta parte del campo.
    if (this.phase === 'play' && b.vx > 0 && b.x >= this.width * this.cfg.aiReactFrom) {
      target = this.predictY(this.aiFace - BALL_HALF) + this.aiAim;
    }
    const delta = target - this.aiY;
    const step = this.cfg.aiSpeed * dt;
    this.aiY = this.clampPaddle(this.aiY + Math.max(-step, Math.min(step, delta)));
  }

  /** Altura a la que la bola cruzará la x indicada, plegando los rebotes en las líneas de fondo. */
  private predictY(x: number): number {
    const b = this.ball;
    if (b.vx === 0) return b.y;
    const t = (x - b.x) / b.vx;
    const minY = this.top + BALL_HALF;
    const span = this.bottom - BALL_HALF - minY;
    let y = b.y + b.vy * t - minY;
    const period = span * 2;
    y = ((y % period) + period) % period;
    return minY + (y > span ? period - y : y);
  }

  /** El error de puntería crece con la velocidad de la bola: los peloteos largos la hacen fallar. */
  private newAim(): void {
    const speedFactor = this.ball.speed / this.cfg.ballSpeed;
    this.aiAim = (this.random() * 2 - 1) * this.cfg.aiError * speedFactor;
  }

  private clampPaddle(y: number): number {
    const half = this.cfg.paddleHeight / 2;
    return Math.max(this.top + half, Math.min(this.bottom - half, y));
  }
}
