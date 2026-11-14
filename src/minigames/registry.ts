import { PongMode } from './pong/PongMode';
import type { MinigameDef } from './types';

/** Minijuegos disponibles en los portales. Añadir uno es añadir una entrada aquí. */
export const MINIGAMES: readonly MinigameDef[] = [
  { id: 'pong', name: 'PONG', create: (ctx, done) => new PongMode(ctx, done) },
];

export const minigameById = (id: string): MinigameDef => MINIGAMES.find((m) => m.id === id) ?? MINIGAMES[0];
