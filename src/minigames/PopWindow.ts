/** Muelle que persigue un objetivo (con rebote si está poco amortiguado). */
class TargetSpring {
  velocity = 0;
  constructor(
    public value: number,
    public target: number,
    private k: number,
    private c: number,
  ) {}
  update(dt: number): void {
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.velocity += (this.k * (this.target - this.value) - this.c * this.velocity) * h;
      this.value += this.velocity * h;
    }
  }
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t * t * t;

/** Duración de la salida: anticipación y salida disparada. */
const LEAVE_TIME = 0.62;
const ANTICIPATION = 0.24;

/**
 * Ventana de minijuego "viva", al estilo Balatro: entra cayendo desde arriba
 * girada y diminuta y se asienta con rebotes de muelle; mientras está abierta
 * flota y se inclina en 3D con suavidad; reacciona a golpes (giro, escala y
 * temblor) y al cerrarse coge impulso y sale disparada girando: hacia arriba
 * si se ha ganado, cayendo si se ha perdido. También funde el fondo oscuro.
 *
 * Se actualiza por fotograma con `update(dt)`; reutilizable por cualquier minijuego.
 */
export class PopWindow {
  private time = 0;
  private scale = new TargetSpring(0.04, 1, 190, 15);
  private rot = new TargetSpring(-18, 0, 150, 9);
  private y = new TargetSpring(-0.45, 0, 120, 13);
  private shakeTime = 0;
  private shakeDuration = 1;
  private shakeAmount = 0;
  private leaving = -1;
  private leaveWon = true;
  private from = { scale: 1, rot: 0, y: 0 };

  constructor(
    private win: HTMLElement,
    private backdrop: HTMLElement,
  ) {
    this.update(0);
  }

  /** Golpe de giro (grados, con signo) y de escala. */
  kick(degrees: number, pop = 0): void {
    this.rot.velocity += degrees * 16;
    this.scale.velocity += pop * 18;
  }

  /** Temblor (px) que se desvanece en `duration` s. */
  shake(amount: number, duration = 0.35): void {
    this.shakeAmount = Math.max(this.shakeAmount * (this.shakeTime / this.shakeDuration), amount);
    this.shakeDuration = duration;
    this.shakeTime = duration;
  }

  /** Empieza la salida. `gone` pasa a true cuando ha terminado. */
  leave(won: boolean): void {
    if (this.leaving >= 0) return;
    this.leaving = 0;
    this.leaveWon = won;
    this.from = { scale: this.scale.value, rot: this.rot.value, y: this.y.value };
  }

  get gone(): boolean {
    return this.leaving >= LEAVE_TIME;
  }

  update(dt: number): void {
    this.time += dt;
    let scale: number;
    let rot: number;
    let y: number;
    let dim = Math.min(1, this.time / 0.25);
    if (this.leaving < 0) {
      this.scale.update(dt);
      this.rot.update(dt);
      this.y.update(dt);
      scale = this.scale.value;
      rot = this.rot.value;
      y = this.y.value;
    } else {
      this.leaving += dt;
      const t = Math.min(1, this.leaving / LEAVE_TIME);
      const dir = this.leaveWon ? 1 : -1;
      const a = Math.min(1, t / ANTICIPATION);
      // Anticipación: crece un poco y gira hacia el lado contrario...
      const k = easeOut(a);
      scale = this.from.scale + (1.1 - this.from.scale) * k;
      rot = this.from.rot + (-4 * dir - this.from.rot) * k;
      y = this.from.y + (0.02 * dir - this.from.y) * k;
      // ...y sale disparada girando y encogiendo.
      if (t > ANTICIPATION) {
        const e = easeIn((t - ANTICIPATION) / (1 - ANTICIPATION));
        scale = 1.1 * (1 - e) + 0.02 * e;
        rot = -4 * dir + 34 * dir * e;
        y = 0.02 * dir - (dir > 0 ? 0.55 : -0.75) * e;
      }
      dim = 1 - easeOut(t);
    }

    // Flotación e inclinación 3D en reposo.
    const tiltX = Math.sin(this.time * 0.9) * 1.1;
    const tiltY = Math.sin(this.time * 0.67 + 1) * 1.5;
    rot += Math.sin(this.time * 1.1 + 0.4) * 0.25;
    let px = 0;
    let py = y * window.innerHeight + Math.sin(this.time * 1.7) * 1.5;
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const s = (this.shakeTime / this.shakeDuration) * this.shakeAmount;
      px += (Math.random() * 2 - 1) * s;
      py += (Math.random() * 2 - 1) * s;
    }
    this.win.style.transform =
      `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) perspective(1100px) rotateX(${tiltX.toFixed(2)}deg) ` +
      `rotateY(${tiltY.toFixed(2)}deg) rotate(${rot.toFixed(2)}deg) scale(${Math.max(0.01, scale).toFixed(3)})`;
    this.backdrop.style.setProperty('--mg-dim', dim.toFixed(3));
  }
}
