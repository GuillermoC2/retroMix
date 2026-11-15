import type { GameContext } from '../../core/Game';
import type { Action } from '../../core/Input';
import type { GameMode } from '../../core/ModeStack';

/** Truco que se activa, desactiva o cambia de valor (tecla numérica o clic). */
export interface GodMenuToggle {
  label: string;
  /** Estado que se muestra a la derecha (p. ej. "SI"/"NO"). */
  value: () => string;
  /** ¿Está activo? (colorea el valor). */
  on: () => boolean;
  toggle: () => void;
}

/** Grupo de acciones con su título y color en el menú. */
export interface GodMenuSection {
  title: string;
  /** Color del panel (CSS). */
  color: string;
  actions: GodMenuAction[];
}

/** Acción que cierra el menú y se ejecuta en la partida (p. ej. lanzar un poder especial). Solo con clic. */
export interface GodMenuAction {
  label: string;
  /** Texto del botón (p. ej. "ACTIVAR" o "QUITAR"). */
  button: () => string;
  run: () => void;
}

const OPTION_ACTIONS: readonly Action[] = ['opt1', 'opt2', 'opt3', 'opt4', 'opt5', 'opt6', 'opt7', 'opt8', 'opt9'];
const TOGGLES_COLOR = '#3ae8ff';

/**
 * Menú de modo dios (solo desarrollo). Se apila sobre la partida, que queda en
 * pausa; K o Esc lo cierran. Paneles de colores en columnas:
 *  - TRUCOS: se cambian con las teclas 1–9 o con clic.
 *  - Secciones de acciones (poderes, teletransporte, pruebas…): con clic;
 *    cierran el menú y se ejecutan.
 */
export class GodMenuMode implements GameMode {
  readonly overlay = true;
  private root = document.createElement('div');
  private closed = false;

  constructor(
    private ctx: GameContext,
    private toggles: GodMenuToggle[],
    private sections: GodMenuSection[],
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
    const el = (tag: string, className: string, text = '') => {
      const e = document.createElement(tag);
      e.className = className;
      e.textContent = text;
      return e;
    };
    const panel = (title: string, hint: string, color: string) => {
      const p = el('section', 'god-panel');
      p.style.setProperty('--c', color);
      const head = el('div', 'god-panel-title', title);
      head.append(el('span', 'god-panel-hint', hint));
      p.append(head);
      grid.append(p);
      return p;
    };
    const row = (label: string, value: string, valueClass: string, onClick: () => void, key = '') => {
      const b = el('button', 'god-row');
      if (key) b.append(el('span', 'god-key', key));
      b.append(el('span', 'god-label', label), el('b', `god-value ${valueClass}`, value));
      b.addEventListener('click', onClick);
      return b;
    };

    const head = el('div', 'god-head');
    head.append(el('div', 'god-title', 'MODO DIOS'), el('div', 'god-sub', 'PARTIDA EN PAUSA · K / ESC: CERRAR'));
    const grid = el('div', 'god-grid');

    const toggles = panel('TRUCOS', 'TECLA O CLIC', TOGGLES_COLOR);
    this.toggles.forEach((t, i) =>
      toggles.append(
        row(t.label, t.value(), t.on() ? 'on' : 'off', () => {
          t.toggle();
          this.draw();
        }, String(i + 1)),
      ),
    );
    for (const section of this.sections) {
      const p = panel(section.title, 'CLIC', section.color);
      for (const a of section.actions) {
        p.append(
          row(a.label, a.button(), 'action', () => {
            this.close();
            a.run();
          }),
        );
      }
    }
    this.root.replaceChildren(head, grid);
  }

  render(): void {}
}
