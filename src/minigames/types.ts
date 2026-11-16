import type { GameContext } from '../core/Game';
import type { GameMode } from '../core/ModeStack';

/** Lo que un minijuego devuelve al terminar. Se ampliará cuando un juego necesite más (p. ej. una puntuación). */
export interface MinigameResult {
  won: boolean;
}

/**
 * Desde dónde se entra: un muro portal (`gate`, la recompensa es la tienda de
 * habilidades) o un portal de sala (`portal`, la recompensa es un poder especial).
 * Los portales son más difíciles porque dan más: cada minijuego decide cómo.
 */
export type MinigameKind = 'gate' | 'portal';

/** Qué se juega el jugador: el tipo de entrada y los textos que el minijuego muestra. */
export interface MinigameStakes {
  kind: MinigameKind;
  /** Texto bajo "¡HAS GANADO!" (p. ej. "TE LLEVAS UN PODER ESPECIAL"). */
  wonText: string;
  /** Texto bajo "HAS PERDIDO" (p. ej. "FIN DE LA PARTIDA"). */
  lostText: string;
}

/**
 * Un minijuego que se puede lanzar desde un portal o un muro portal. `create` devuelve un modo
 * superpuesto (`overlay`) que se apila sobre el laberinto pausado; al acabar,
 * llama a `done` una sola vez y se retira él mismo con `ctx.modes.pop()`.
 */
export interface MinigameDef {
  id: string;
  /** Nombre que se muestra sobre el portal y en la ventana. */
  name: string;
  create(ctx: GameContext, done: (result: MinigameResult) => void, stakes: MinigameStakes): GameMode;
}
