/**
 * Un "modo" es una pantalla/juego autocontenido (la carrera por el laberinto hoy;
 * minijuegos en el futuro). Solo el modo superior se actualiza y se dibuja.
 *
 * Flujo previsto para desafíos: el modo del laberinto apila un minijuego con
 * `push()` (recibe `pause()`), el minijuego entrega su resultado mediante el
 * callback que le pasó quien lo creó y se retira con `pop()`, y el laberinto
 * recibe `resume()` y aplica el resultado.
 */
export interface GameMode {
  enter(): void;
  exit(): void;
  pause?(): void;
  resume?(): void;
  update(dt: number): void;
  render(): void;
}

export class ModeStack {
  private stack: GameMode[] = [];

  get top(): GameMode | undefined {
    return this.stack[this.stack.length - 1];
  }

  push(mode: GameMode): void {
    this.top?.pause?.();
    this.stack.push(mode);
    mode.enter();
  }

  pop(): void {
    const mode = this.stack.pop();
    mode?.exit();
    this.top?.resume?.();
  }

  /** Sustituye el modo superior (p. ej. reiniciar partida). */
  replace(mode: GameMode): void {
    this.stack.pop()?.exit();
    this.stack.push(mode);
    mode.enter();
  }

  update(dt: number): void {
    this.top?.update(dt);
  }

  render(): void {
    this.top?.render();
  }
}
