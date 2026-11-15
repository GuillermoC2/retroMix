import { BlocksMode } from './blocks/BlocksMode';
import { PongMode } from './pong/PongMode';
import type { MinigameDef } from './types';

/** Minijuegos disponibles en los portales y muros portal. Añadir uno es añadir una entrada aquí. */
export const MINIGAMES: readonly MinigameDef[] = [
  { id: 'pong', name: 'PONG', create: (ctx, done, stakes) => new PongMode(ctx, done, stakes) },
  { id: 'blocks', name: 'BLOQUES', create: (ctx, done, stakes) => new BlocksMode(ctx, done, stakes) },
];

export const minigameById = (id: string): MinigameDef => MINIGAMES.find((m) => m.id === id) ?? MINIGAMES[0];
