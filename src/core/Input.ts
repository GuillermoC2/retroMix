export type Action = 'up' | 'down' | 'left' | 'right' | 'camera' | 'confirm' | 'power' | 'god';

/** Una tecla puede disparar varias acciones; cada modo decide cuáles le importan según su estado. */
const KEY_MAP: Record<string, readonly Action[]> = {
  ArrowUp: ['up'],
  KeyW: ['up'],
  ArrowDown: ['down'],
  KeyS: ['down'],
  ArrowLeft: ['left'],
  KeyA: ['left'],
  ArrowRight: ['right'],
  KeyD: ['right'],
  KeyC: ['camera'],
  KeyK: ['god'],
  Enter: ['confirm'],
  Space: ['confirm', 'power'],
};

/**
 * Teclado → acciones abstractas. Guarda las pulsaciones del frame (para eventos
 * puntuales) y el orden de las teclas mantenidas (para saber cuál es la más reciente).
 */
export class Input {
  private held: Action[] = [];
  private pressedThisFrame = new Set<Action>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      const actions = KEY_MAP[e.code];
      if (!actions) return;
      e.preventDefault();
      if (e.repeat) return;
      for (const action of actions) {
        this.pressedThisFrame.add(action);
        this.held = this.held.filter((a) => a !== action);
        this.held.push(action);
      }
    });
    target.addEventListener('keyup', (e) => {
      const actions = KEY_MAP[e.code];
      if (actions) this.held = this.held.filter((a) => !actions.includes(a));
    });
    target.addEventListener('blur', () => {
      this.held = [];
    });
  }

  /** ¿Se pulsó la acción en este frame? */
  pressed(action: Action): boolean {
    return this.pressedThisFrame.has(action);
  }

  isHeld(action: Action): boolean {
    return this.held.includes(action);
  }

  /** Última acción mantenida de entre las indicadas (la tecla pulsada más recientemente gana). */
  latestHeld(actions: readonly Action[]): Action | null {
    for (let i = this.held.length - 1; i >= 0; i--) {
      if (actions.includes(this.held[i])) return this.held[i];
    }
    return null;
  }

  /** Debe llamarse al final de cada frame. */
  endFrame(): void {
    this.pressedThisFrame.clear();
  }
}
