/**
 * Texto de interfaz "vivo": flota con un balanceo rítmico, sus caracteres
 * ondulan y reacciona a eventos con muelles (rebota y se asienta en lugar de
 * cortarse en seco). Pensado para reutilizarse en cualquier modo de juego; los
 * efectos nuevos se añaden como métodos que alteran el estado de los muelles.
 *
 * Se actualiza por fotograma con `update(dt)` desde el bucle del juego, para
 * que todos los efectos se combinen en una sola transformación.
 */

export interface JuicyTextOptions {
  className?: string;
  /** Balanceo lateral: amplitud (px) y periodo (s). */
  swayAmplitude?: number;
  swayPeriod?: number;
  /** Inclinación que acompaña al balanceo (grados). */
  tiltAmplitude?: number;
  /** Ondulación vertical de cada carácter: amplitud (px) y desfase entre caracteres (rad). */
  waveAmplitude?: number;
  wavePhase?: number;
  /** Punto de origen de escalado/rotación (CSS transform-origin). */
  origin?: string;
}

/** Muelle amortiguado (oscila alrededor de 0). */
class Spring {
  value = 0;
  velocity = 0;

  constructor(
    private stiffness: number,
    private damping: number,
  ) {}

  update(dt: number): void {
    // Subpasos para que sea estable aunque el fotograma sea largo.
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.velocity += (-this.stiffness * this.value - this.damping * this.velocity) * h;
      this.value += this.velocity * h;
    }
  }
}

export class JuicyText {
  readonly root: HTMLElement;
  /** Elemento transformado (balanceo, escala y giro); `root` solo se posiciona. */
  readonly body: HTMLElement;
  private chars: HTMLSpanElement[] = [];
  private text = '';
  private time = Math.random() * 10;
  private readonly opts: Required<JuicyTextOptions>;

  /** Escala de reposo (p. ej. crece por hitos). Se interpola suavemente. */
  private baseScale = 1;
  private shownBaseScale = 1;
  /** Factor externo para que quepa en el espacio disponible. */
  fit = 1;

  private scaleSpring = new Spring(260, 9);
  private rotSpring = new Spring(200, 8);
  private shakeTime = 0;
  private shakeDuration = 0;
  private shakeAmount = 0;

  constructor(parent: HTMLElement, opts: JuicyTextOptions = {}) {
    this.opts = {
      className: '',
      swayAmplitude: 10,
      swayPeriod: 2.6,
      tiltAmplitude: 3,
      waveAmplitude: 2,
      wavePhase: 0.7,
      origin: 'center',
      ...opts,
    };
    this.root = document.createElement('div');
    this.root.className = `juicy ${this.opts.className}`;
    this.body = document.createElement('div');
    this.body.className = 'juicy-body';
    this.body.style.transformOrigin = this.opts.origin;
    this.root.appendChild(this.body);
    parent.appendChild(this.root);
  }

  /** @param charClass clase CSS extra opcional por carácter (p. ej. una unidad más pequeña). */
  setText(text: string, charClass?: (ch: string, i: number) => string): void {
    if (text === this.text) return;
    this.text = text;
    // Reutiliza los spans existentes para no reiniciar la ondulación en cada cambio.
    while (this.chars.length < text.length) {
      const span = document.createElement('span');
      this.body.appendChild(span);
      this.chars.push(span);
    }
    while (this.chars.length > text.length) this.chars.pop()!.remove();
    this.chars.forEach((span, i) => {
      span.textContent = text[i];
      span.className = `juicy-char ${charClass?.(text[i], i) ?? ''}`;
    });
  }

  setBaseScale(scale: number): void {
    this.baseScale = scale;
  }

  /** Golpe de escala: rebota por encima y se asienta. */
  pop(strength = 0.15): void {
    this.scaleSpring.velocity += strength * 22;
  }

  /** Golpe de giro (grados, con signo). */
  kick(degrees = 6): void {
    this.rotSpring.velocity += degrees * 18;
  }

  /** Temblor breve (px) que se desvanece. */
  shake(amount = 6, duration = 0.35): void {
    this.shakeAmount = Math.max(this.shakeAmount * (this.shakeTime / Math.max(this.shakeDuration, 1e-6)), amount);
    this.shakeDuration = duration;
    this.shakeTime = duration;
  }

  /** Aplica una clase CSS durante `ms` (destellos de color, etc.). */
  flash(className: string, ms = 220): void {
    this.body.classList.remove(className);
    void this.body.offsetWidth; // reinicia animaciones CSS asociadas
    this.body.classList.add(className);
    window.setTimeout(() => this.body.classList.remove(className), ms);
  }

  /** Chispas pixeladas que salen despedidas desde el centro del texto. */
  burst(count = 10, className = ''): void {
    const w = this.body.offsetWidth;
    const h = this.body.offsetHeight;
    for (let i = 0; i < count; i++) {
      const spark = document.createElement('div');
      spark.className = `juicy-spark ${className}`;
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 40 + Math.random() * 50;
      spark.style.left = `${w / 2 + (Math.random() - 0.5) * w * 0.6}px`;
      spark.style.top = `${h / 2}px`;
      spark.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      spark.style.setProperty('--dy', `${Math.sin(angle) * dist * 0.7}px`);
      spark.addEventListener('animationend', () => spark.remove());
      this.root.appendChild(spark);
    }
  }

  /** Anchura sin transformar (para calcular cuánto espacio ocupa). */
  get naturalWidth(): number {
    return this.body.offsetWidth;
  }

  /** Altura sin transformar. */
  get naturalHeight(): number {
    return this.body.offsetHeight;
  }

  /** Escala de reposo objetivo (sin muelles ni ajuste de espacio). */
  get restScale(): number {
    return this.baseScale;
  }

  get currentScale(): number {
    return this.shownBaseScale * this.fit;
  }

  update(dt: number): void {
    const o = this.opts;
    this.time += dt;
    this.scaleSpring.update(dt);
    this.rotSpring.update(dt);
    this.shownBaseScale += (this.baseScale - this.shownBaseScale) * (1 - Math.exp(-dt * 6));

    const phase = (this.time / o.swayPeriod) * Math.PI * 2;
    let x = Math.sin(phase) * o.swayAmplitude;
    let y = Math.sin(phase * 2) * o.swayAmplitude * 0.15;
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const k = (this.shakeTime / this.shakeDuration) * this.shakeAmount;
      x += (Math.random() * 2 - 1) * k;
      y += (Math.random() * 2 - 1) * k;
    }
    const rot = Math.sin(phase + 0.6) * o.tiltAmplitude + this.rotSpring.value;
    const scale = this.currentScale * (1 + this.scaleSpring.value);
    this.body.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;

    this.chars.forEach((span, i) => {
      const wy = Math.sin(this.time * 3.2 + i * o.wavePhase) * o.waveAmplitude;
      span.style.transform = `translateY(${wy.toFixed(1)}px)`;
    });
  }

  dispose(): void {
    this.root.remove();
  }
}
