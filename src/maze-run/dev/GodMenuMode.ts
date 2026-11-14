import type { GameContext } from '../../core/Game';
import type { Action } from '../../core/Input';
import type { GameMode } from '../../core/ModeStack';

/** Truco que se activa o desactiva (tecla numérica o clic). */
export interface GodMenuToggle {
  label: string;
  /** Estado que se muestra a la derecha (p. ej. "SI"/"NO"). */
  value: () => string;
  toggle: () => void;
}

/** Acción que cierra el menú y se ejecuta en la partida (p. ej. lanzar un poder especial). Solo con clic. */
export interface GodMenuAction {
  label: string;
  /** Texto del botón (p. ej. "ACTIVAR" o "QUITAR"). */
  button: () => string;
  run: () => void;
}

const OPTION_ACTIONS: readonly Action[] = ['opt1', 'opt2', 'opt3', 'opt4', 'opt5', 'opt6', 'opt7', 'opt8', 'opt9'];

/**
 * Menú de modo dios (solo desarrollo). Se apila sobre la partida, que queda en
 * pausa; K o Esc lo cierran.
 *  - TRUCOS: se cambian con las teclas 1–9 o con clic.
 *  - PODERES ESPECIALES: con clic; cierran el menú y lanzan el poder.
 * Aspecto deliberadamente mínimo.
 */
export class GodMenuMode implements GameMode {
  readonly overlay = true;
  private root = document.createElement('div');
  private closed = false;

  constructor(
    private ctx: GameContext,
    private toggles: GodMenuToggle[],
    private actions: GodMenuAction[],
  ) {}

  enter(): void {
    this.root.className = 'god-menu';
    this.ctx.ui.appendChild(this.root);
    this.draw();
  }

  exit(): void {
    this.root.remove();
  }

  update(): void {
    const { input } = this.ctx;
    if (input.pressed('god') || input.pressed('back')) return this.close();
    let changed = false;
    this.toggles.forEach((t, i) => {
      if (!input.pressed(OPTION_ACTIONS[i])) return;
      t.toggle();
      changed = true;
    });
    if (changed) this.draw();
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    this.ctx.modes.pop();
  }

  private draw(): void {
    this.root.innerHTML = '';
    const line = (className: string, text: string) => {
      const e = document.createElement('div');
      e.className = className;
      e.textContent = text;
      this.root.appendChild(e);
    };
    const button = (label: string, value: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.className = 'god-row';
      const l = document.createElement('span');
      l.textContent = label;
      const v = document.createElement('b');
      v.textContent = value;
      b.append(l, v);
      b.addEventListener('click', onClick);
      this.root.appendChild(b);
    };

    line('god-title', 'MODO DIOS (PAUSA)');
    line('god-section', 'TRUCOS (TECLA O CLIC)');
    this.toggles.forEach((t, i) =>
      button(`${i + 1}  ${t.label}`, t.value(), () => {
        t.toggle();
        this.draw();
      }),
    );
    line('god-section', 'PODERES ESPECIALES (CLIC)');
    for (const a of this.actions) {
      button(a.label, a.button(), () => {
        this.close();
        a.run();
      });
    }
    line('god-foot', 'K / ESC: CERRAR');
  }

  render(): void {}
}
