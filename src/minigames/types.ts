import type { GameContext } from '../core/Game';
import type { GameMode } from '../core/ModeStack';

/** Lo que un minijuego devuelve al terminar. Se ampliará cuando un juego necesite más (p. ej. una puntuación). */
export interface MinigameResult {
  won: boolean;
}

/**
 * Un minijuego que se puede lanzar desde un portal. `create` devuelve un modo
 * superpuesto (`overlay`) que se apila sobre el laberinto pausado; al acabar,
 * llama a `done` una sola vez y se retira él mismo con `ctx.modes.pop()`.
 */
export interface MinigameDef {
  id: string;
  /** Nombre que se muestra sobre el portal y en la ventana. */
  name: string;
  create(ctx: GameContext, done: (result: MinigameResult) => void): GameMode;
}
