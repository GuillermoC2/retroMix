import type { GameContext } from '../core/Game';
import { JuicyText } from '../ui/JuicyText';
import { PixelFire } from '../ui/PixelFire';
import { PopWindow } from '../ui/PopWindow';

export interface FrameOptions {
  title: string;
  /** Variante difícil (portal de poder especial): ventana y letras rojas. */
  hard: boolean;
  /** HTML opcional de los extremos de la barra de título. */
  left?: string;
  right?: string;
  /** Proporción ancho/alto de la pantalla del juego. */
  aspect: number;
  /** Parte de la ventana que puede ocupar la pantalla: ancho y alto (fracción del viewport). */
  maxWidth?: number;
  maxHeight?: number;
  /** Ancho (en "píxeles lógicos") que da el tamaño de los textos: más pequeño = textos más grandes. */
  textBase: number;
}

export interface BigTextOptions {
  /** `good` (amarillo) o `bad` (rojo). */
  tone?: '' | 'good' | 'bad';
  /** Aviso importante: rebota más, gira más y tiembla. */
  strong?: boolean;
  /** En llamas pixeladas (solo tiene sentido en la variante difícil). */
  fire?: boolean;
  /** Chispas al aparecer (p. ej. al ganar). */
  burst?: boolean;
}

/**
 * Ventana común de los minijuegos: fondo oscuro, marco animado (`PopWindow`),
 * barra con el título (cae letra a letra), pantalla con el canvas del juego,
 * aviso grande (`JuicyText`, opcionalmente en llamas con `PixelFire`) y texto
 * pequeño. El canvas tiene píxeles del mismo tamaño que los del laberinto y se
 * escala por CSS a un tamaño exacto; `onResize` recibe el tamaño interno.
 */
export class MinigameFrame {
  readonly root = document.createElement('div');
  readonly win = document.createElement('div');
  readonly bar = document.createElement('div');
  readonly screen = document.createElement('div');
  readonly canvas = document.createElement('canvas');
  private small = document.createElement('div');
  private title!: JuicyText;
  private big!: JuicyText;
  private pop!: PopWindow;
  private fire = new PixelFire();
  private bigShown = '';
  private closing: (() => void) | null = null;
  private onResize: (width: number, height: number) => void = () => {};
  private readonly resizeListener = () => this.fit();
  /** Tamaño en px de CSS de cada píxel del canvas. */
  pixel = 1;

  constructor(
    private ctx: GameContext,
    private opts: FrameOptions,
  ) {}

  /** Crea la ventana y la muestra (entra con su animación). */
  mount(onResize: (width: number, height: number) => void): void {
    const { opts } = this;
    this.onResize = onResize;
    this.root.className = `mg-overlay${opts.hard ? ' mg-hard' : ''}`;
    this.win.className = 'mg-window';
    this.bar.className = 'mg-titlebar';
    this.bar.innerHTML = `<span class="mg-side mg-you">${opts.left ?? ''}</span><span class="mg-side mg-rival">${opts.right ?? ''}</span>`;
    const right = this.bar.lastElementChild;
    this.title = new JuicyText(this.bar, { className: 'mg-title', swayAmplitude: 3, swayPeriod: 3.2, tiltAmplitude: 2, waveAmplitude: 2.5 });
    this.bar.insertBefore(this.title.root, right);
    this.title.setText(opts.title);
    // Las letras del título entran una a una (animación CSS con retraso por letra).
    [...this.title.body.children].forEach((c, i) => (c as HTMLElement).style.setProperty('--i', String(i)));

    this.canvas.className = 'mg-canvas';
    this.screen.className = 'mg-screen';
    this.small.className = 'mg-small';
    this.screen.append(this.canvas, this.small);
    this.big = new JuicyText(this.screen, { className: 'mg-big', swayAmplitude: 4, swayPeriod: 2.2, tiltAmplitude: 3, waveAmplitude: 3 });
    this.win.append(this.bar, this.screen);
    this.root.appendChild(this.win);
    this.ctx.ui.appendChild(this.root);
    this.pop = new PopWindow(this.win, this.root);
    window.addEventListener('resize', this.resizeListener);
    this.fit();
  }

  unmount(): void {
    window.removeEventListener('resize', this.resizeListener);
    this.root.remove();
  }

  update(dt: number): void {
    this.pop.update(dt);
    this.title.update(dt);
    this.big.update(dt);
    this.fire.update(dt);
    if (this.closing && this.pop.gone) {
      const then = this.closing;
      this.closing = () => {};
      then();
    }
  }

  /** Muestra un aviso grande (si cambia); texto vacío lo quita. */
  showBig(text: string, o: BigTextOptions = {}): void {
    if (text === this.bigShown) return;
    this.bigShown = text;
    this.big.setText(text);
    this.big.root.dataset.tone = o.tone ?? '';
    const onFire = !!o.fire && !!text;
    this.big.root.classList.toggle('mg-fire', onFire);
    // Las letras se quedan quietas sobre su fuego (que nace de su forma).
    this.big.wave = onFire ? 0 : 1;
    if (onFire) this.fire.attach(this.big.body);
    else this.fire.detach();
    if (!text) return;
    this.big.pop(o.strong ? 0.9 : 0.5);
    this.big.kick((Math.random() < 0.5 ? -1 : 1) * (o.strong ? 12 : 6));
    if (o.strong) this.big.shake(5, 0.3);
    if (o.burst) this.big.burst(18, this.opts.hard ? 'mg-spark-fire' : '');
  }

  get bigText(): string {
    return this.bigShown;
  }

  setSmall(text: string): void {
    if (this.small.textContent === text) return;
    this.small.textContent = text;
    if (text) this.bump('mg-small-pop', this.small);
  }

  /** Destello del borde de la pantalla (golpes). */
  flash(): void {
    this.bump('mg-hit', this.screen);
  }

  kick(degrees: number, pop = 0): void {
    this.pop.kick(degrees, pop);
  }

  shake(amount: number, duration?: number): void {
    this.pop.shake(amount, duration);
  }

  /** Cierra la ventana con su animación (arriba al ganar, cayendo al perder) y después llama a `then`. */
  close(won: boolean, then: () => void): void {
    if (this.closing) return;
    this.closing = then;
    this.pop.leave(won);
  }

  get isClosing(): boolean {
    return this.closing !== null;
  }

  /** Reinicia una animación CSS de un solo uso. */
  private bump(className: string, el: HTMLElement): void {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  private fit(): void {
    const { aspect, maxWidth = 0.74, maxHeight = 0.64, textBase } = this.opts;
    const pixel = (this.pixel = this.ctx.renderer.pixelScale / window.devicePixelRatio);
    const cssW = Math.min(window.innerWidth * maxWidth, window.innerHeight * maxHeight * aspect);
    const w = Math.max(96, Math.floor(cssW / pixel));
    const h = Math.round(w / aspect);
    this.canvas.style.width = `${w * pixel}px`;
    this.canvas.style.height = `${h * pixel}px`;
    this.root.style.setProperty('--mg-scale', ((w * pixel) / textBase).toFixed(2));
    this.onResize(w, h);
  }
}
