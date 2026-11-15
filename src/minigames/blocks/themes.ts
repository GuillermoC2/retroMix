import { CONFIG } from '../../config';
import type { MinigameKind } from '../types';

/** Aspecto del pozo 3D de BLOQUES. */
export interface BlocksTheme {
  /** Variante difícil (portal de poder especial): rojiza, con brasas y avisos en llamas. */
  hard: boolean;
  clear: number;
  /** Fondo del pozo y su rejilla. */
  back: number;
  grid: number;
  /** Cuerpo de las paredes del pozo; su neón recorre `neon` como los muros del laberinto. */
  wallBody: number;
  neon: { colors: readonly number[]; secondsPerColor: number; transition: number };
  /** Color de cada tipo de pieza (1–7). */
  pieces: readonly number[];
  ambient: number;
  ambientIntensity: number;
  flicker: boolean;
  embers: boolean;
}

export const BLOCKS_THEMES: Record<MinigameKind, BlocksTheme> = {
  // Muro portal: los neones del laberinto.
  gate: {
    hard: false,
    clear: 0x05051a,
    back: 0x0a0b26,
    grid: 0x1d2152,
    wallBody: 0x17183a,
    neon: CONFIG.maze.neon,
    pieces: [0x2ee8ff, 0xffd51a, 0xb04bff, 0x3a6bff, 0xff8a1a, 0x39ff6a, 0xff2e6d],
    ambient: 0xd8dcff,
    ambientIntensity: 0.95,
    flicker: false,
    embers: false,
  },
  // Portal de poder especial: más rápido, todo rojo y ardiendo.
  portal: {
    hard: true,
    clear: 0x0e0103,
    back: 0x1c0306,
    grid: 0x4e0a10,
    wallBody: 0x2c070a,
    neon: { colors: [0xff1414, 0xff5a0a, 0xc80018, 0xff3300], secondsPerColor: 0.9, transition: 0.7 },
    pieces: [0xffe066, 0xffb020, 0xff7a10, 0xff3a1a, 0xd0102a, 0xfff2c8, 0xb8306a],
    ambient: 0xffb090,
    ambientIntensity: 0.9,
    flicker: true,
    embers: true,
  },
};
