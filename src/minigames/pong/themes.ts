import { CONFIG } from '../../config';
import type { MinigameKind } from '../types';

/** Aspecto de la pista 3D del Pong. */
export interface PongTheme {
  /** Variante difícil (portal de poder especial): rojiza, con brasas y textos en llamas. */
  hard: boolean;
  /** Fondo fuera de la pista. */
  clear: number;
  /** Suelo de la pista y líneas de su rejilla. */
  floor: number;
  grid: number;
  /** Cuerpo de las barandillas; su neón recorre `neon` como los muros del laberinto. */
  railBody: number;
  neon: { colors: readonly number[]; secondsPerColor: number; transition: number };
  net: number;
  player: number;
  ai: number;
  ball: number;
  /** Luz ambiental (color e intensidad) y si parpadea como una hoguera. */
  ambient: number;
  ambientIntensity: number;
  flicker: boolean;
  /** Brasas que suben del suelo sin parar. */
  embers: boolean;
}

export const PONG_THEMES: Record<MinigameKind, PongTheme> = {
  // Muro portal: los colores del laberinto.
  gate: {
    hard: false,
    clear: 0x05051a,
    floor: 0x0a0b26,
    grid: 0x1d2152,
    railBody: 0x17183a,
    neon: CONFIG.maze.neon,
    net: 0x4a50a0,
    player: 0xffd51a,
    ai: 0xff2e6d,
    ball: 0xffffff,
    ambient: 0x9aa3ff,
    ambientIntensity: 1.1,
    flicker: false,
    embers: false,
  },
  // Portal de poder especial: más difícil, todo rojo y ardiendo.
  portal: {
    hard: true,
    clear: 0x0e0103,
    floor: 0x1c0306,
    grid: 0x4e0a10,
    railBody: 0x2c070a,
    neon: { colors: [0xff1414, 0xff5a0a, 0xc80018, 0xff3300], secondsPerColor: 0.9, transition: 0.7 },
    net: 0x8a1410,
    player: 0xffd51a,
    ai: 0xff2a10,
    ball: 0xfff0c8,
    ambient: 0xff7a50,
    ambientIntensity: 1.0,
    flicker: true,
    embers: true,
  },
};
