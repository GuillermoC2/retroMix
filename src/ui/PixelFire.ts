/** Paleta del fuego, de frío (1) a muy caliente; 0 = vacío. Colores planos, sin degradados. */
const PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [58, 0, 0],
  [110, 4, 0],
  [160, 12, 0],
  [205, 30, 0],
  [236, 62, 0],
  [255, 98, 0],
  [255, 138, 16],
  [255, 178, 32],
  [255, 216, 74],
  [255, 243, 160],
];
const MAX_HEAT = PALETTE.length - 1;
/** Pasos de simulación por segundo: pocos, para que se mueva "a saltos" como en las recreativas. */
const STEPS_PER_SECOND = 24;
/** Píxeles por letra de la fuente pixelada. */
const FONT_GRID = 8;

/**
 * Fuego pixel art que arde desde la forma de un texto. Es la simulación clásica
 * de fuego de las demos y juegos retro: cada píxel toma el calor del de debajo
 * (con un desvío lateral al azar), enfriado un poco, y el color sale de una
 * paleta fija. Las letras son la fuente de calor, así que las llamas nacen de
 * ellas. Se dibuja en un canvas de muy baja resolución escalado sin suavizado,
 * detrás del texto, con píxeles del mismo tamaño que los de la fuente pixelada
 * (Press Start 2P dibuja cada letra en una rejilla de 8 × 8), así que letras y
 * llamas comparten rejilla.
 *
 * `attach(body)` lo coloca dentro del elemento del texto (que debe crear su propio
 * contexto de apilamiento, p. ej. con un transform) y calcula la forma de las
 * letras a partir de sus caracteres (`body.children`).
 */
export class PixelFire {
  readonly canvas = document.createElement('canvas');
  private g = this.canvas.getContext('2d')!;
  private heat: Uint8Array = new Uint8Array(0);
  private source: Uint8Array = new Uint8Array(0);
  /** Combustible de cada columna (0 a -3): varía con el tiempo y hace que unas lenguas suban más que otras. */
  private fuel = new Float32Array(0);
  private image: ImageData | null = null;
  private w = 0;
  private h = 0;
  private timer = 0;
  /** Tamaño de cada píxel del fuego en px de CSS (el de un píxel de la fuente). */
  private pixel = 4;
  active = false;

  constructor() {
    this.canvas.className = 'pixel-fire';
  }

  /** Coloca el fuego tras el texto de `body` y lo enciende. */
  attach(body: HTMLElement): void {
    const p = (this.pixel = parseFloat(getComputedStyle(body).fontSize) / FONT_GRID);
    const bw = body.offsetWidth;
    const bh = body.offsetHeight;
    // Margen: hacia los lados un poco y por arriba lo que suben las llamas.
    const padX = Math.ceil((bh * 0.35) / p);
    const padTop = Math.ceil((bh * 1.8) / p);
    this.w = Math.ceil(bw / p) + padX * 2;
    this.h = Math.ceil(bh / p) + padTop;
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    Object.assign(this.canvas.style, {
      left: `${-padX * p}px`,
      top: `${-padTop * p}px`,
      width: `${this.w * p}px`,
      height: `${this.h * p}px`,
    });
    this.heat = new Uint8Array(this.w * this.h);
    this.fuel = new Float32Array(this.w).map(() => -Math.random() * 3);
    this.image = this.g.createImageData(this.w, this.h);
    this.source = this.letterMask(body, padX, padTop);
    body.appendChild(this.canvas);
    this.active = true;
    // Unos pasos de golpe para que aparezca ya ardiendo.
    for (let i = 0; i < 24; i++) this.step();
    this.draw();
  }

  /** Apaga y retira el fuego. */
  detach(): void {
    this.active = false;
    this.canvas.remove();
  }

  update(dt: number): void {
    if (!this.active) return;
    this.timer += dt * STEPS_PER_SECOND;
    if (this.timer < 1) return;
    while (this.timer >= 1) {
      this.timer--;
      this.step();
    }
    this.draw();
  }

  /** Forma de las letras en la rejilla del fuego (1 = fuente de calor). */
  private letterMask(body: HTMLElement, padX: number, padTop: number): Uint8Array {
    const p = this.pixel;
    const off = document.createElement('canvas');
    off.width = this.w;
    off.height = this.h;
    const g = off.getContext('2d', { willReadFrequently: true })!;
    const style = getComputedStyle(body);
    g.font = `${FONT_GRID}px ${style.fontFamily}`;
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    for (const el of body.children) {
      const span = el as HTMLElement;
      if (span === this.canvas || !span.textContent?.trim()) continue;
      g.fillText(span.textContent, Math.round(padX + span.offsetLeft / p), Math.round(padTop + (span.offsetTop + span.offsetHeight / 2) / p));
    }
    const data = g.getImageData(0, 0, this.w, this.h).data;
    const mask = new Uint8Array(this.w * this.h);
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 100 ? 1 : 0;
    return mask;
  }

  private step(): void {
    const { w, h, heat, source } = this;
    // El combustible de cada columna cambia poco a poco (lenguas que crecen y menguan).
    const { fuel } = this;
    for (let x = 0; x < w; x++) fuel[x] = Math.min(0, Math.max(-3, fuel[x] + (Math.random() - 0.5) * 2.2));
    // Las letras arden con el calor de su columna.
    for (let i = 0; i < source.length; i++) if (source[i]) heat[i] = MAX_HEAT + Math.round(fuel[i % w]);
    // Cada fila toma el calor de la de debajo, desviado al azar y algo enfriado.
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        const from = (y + 1) * w + Math.min(w - 1, Math.max(0, x + ((Math.random() * 3) | 0) - 1));
        const r = Math.random();
        const cool = r < 0.46 ? 0 : r < 0.86 ? 1 : r < 0.96 ? 2 : 3;
        const i = y * w + x;
        if (!source[i]) heat[i] = Math.max(0, heat[from] - cool);
      }
    }
    // La fila de abajo, fuera de las letras, se apaga.
    for (let x = 0; x < w; x++) {
      const i = (h - 1) * w + x;
      if (!source[i]) heat[i] = 0;
    }
  }

  private draw(): void {
    const img = this.image!;
    const d = img.data;
    for (let i = 0; i < this.heat.length; i++) {
      const v = this.heat[i];
      const c = PALETTE[v];
      d[i * 4] = c[0];
      d[i * 4 + 1] = c[1];
      d[i * 4 + 2] = c[2];
      d[i * 4 + 3] = v === 0 ? 0 : 255;
    }
    this.g.putImageData(img, 0, 0);
  }
}
