import { ModeStack } from './ModeStack';
import { Input } from './Input';
import { Records } from './Records';
import { PixelRenderer } from '../render/PixelRenderer';

/** Servicios compartidos que reciben todos los modos. */
export interface GameContext {
  renderer: PixelRenderer;
  input: Input;
  records: Records;
  modes: ModeStack;
  /** Contenedor DOM para la interfaz del modo activo. */
  ui: HTMLElement;
}

const MAX_DT = 1 / 20;

/** Bucle principal: tiempo, entrada y pila de modos. No sabe nada de ningún juego concreto. */
export class Game {
  readonly ctx: GameContext;
  private last = 0;

  constructor(root: HTMLElement) {
    const ui = document.createElement('div');
    ui.className = 'ui-root';
    const renderer = new PixelRenderer(root);
    root.appendChild(ui);
    this.ctx = { renderer, input: new Input(), records: new Records(), modes: new ModeStack(), ui };
  }

  start(): void {
    const frame = (t: number) => {
      const dt = this.last ? Math.min(MAX_DT, (t - this.last) / 1000) : 0;
      this.last = t;
      this.ctx.modes.update(dt);
      this.ctx.modes.render();
      this.ctx.input.endFrame();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
