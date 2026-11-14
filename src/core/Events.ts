/** Emisor de eventos tipado y mínimo. Permite que sistemas futuros (p. ej. desafíos) escuchen la partida sin acoplarse a ella. */
export class Emitter<Events extends Record<string, unknown>> {
  private listeners: { [K in keyof Events]?: Array<(payload: Events[K]) => void> } = {};

  on<K extends keyof Events>(type: K, fn: (payload: Events[K]) => void): () => void {
    (this.listeners[type] ??= []).push(fn);
    return () => {
      this.listeners[type] = this.listeners[type]?.filter((f) => f !== fn);
    };
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    this.listeners[type]?.forEach((fn) => fn(payload));
  }

  clear(): void {
    this.listeners = {};
  }
}
