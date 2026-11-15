import { CONFIG, type AbilityTier } from '../../config';
import type { PickupKind } from '../systems/Pickups';

/** Niveles de habilidad, de más barato a más caro (orden de las casillas de la tienda). */
export const TIERS: readonly AbilityTier[] = ['basic', 'epic', 'legendary'];

/** Efectos que una habilidad suma a la partida (cada nivel comprado vuelve a sumarlos). */
export interface AbilityEffects {
  /** Segundos extra que dura el susto de los energizadores. */
  frightBonus?: number;
  /** Objeto que aparece por el laberinto mientras se tiene la habilidad (cubito de hielo, bola del láser). */
  pickup?: PickupKind;
}

/** Icono pixel art: filas de caracteres (arriba → abajo) y color de cada carácter; '.' es transparente. */
export interface PixelIcon {
  rows: readonly string[];
  palette: Readonly<Record<string, string>>;
}

export interface AbilityDef {
  id: string;
  tier: AbilityTier;
  name: string;
  description: string;
  /**
   * Veces que se puede comprar en una partida (por defecto 1). Cada compra
   * extra es una mejora: el nombre gana un "+" (SUSTO LARGO +).
   */
  maxLevel?: number;
  /** Texto de la carta cuando se ofrece la mejora (nivel 2 en adelante). */
  upgradeDescription?: string;
  icon: PixelIcon;
  effects: AbilityEffects;
}

/** Nivel máximo de una habilidad. */
export const maxLevel = (a: AbilityDef): number => a.maxLevel ?? 1;

/** Nombre de una habilidad en un nivel: "SUSTO LARGO", "SUSTO LARGO +", "SUSTO LARGO ++"… */
export const abilityName = (a: AbilityDef, level: number): string =>
  level > 1 ? `${a.name} ${'+'.repeat(level - 1)}` : a.name;

/** Fantasma asustado (diseño propio del juego) con un reloj: el susto dura más. */
const SCARED_GHOST_CLOCK: PixelIcon = {
  rows: [
    '.....####.......',
    '...########.....',
    '..##########....',
    '.############...',
    '.###ff###ff##...',
    '####ff###ff###..',
    '##############..',
    '########.wwwww..',
    '###f#f#f.wkkkkw.',
    '##f#f#f#wkkwkkkw',
    '########wkkwkkkw',
    '###..###wkkwwwkw',
    '.###..##wkkkkkkw',
    '.........wkkkkw.',
    '..........wwww..',
  ],
  palette: { '#': '#2a35e0', f: '#ffc4a8', w: '#f4f4ff', k: '#14143a' },
};

/** Fantasma congelado dentro de un bloque de hielo. */
const FROZEN_GHOST: PixelIcon = {
  rows: [
    '.HHHHHHHHHHHHHH.',
    'HWWIIIIIIIIIIIIH',
    'HWIIIIGGGGIIIIIH',
    'HIIIIGGGGGGIIIIH',
    'HIIIGGGGGGGGIIIH',
    'HIIIGeeGGeeGIIIH',
    'HIIIGekGGekGIIIH',
    'HIIIGGGGGGGGIIDH',
    'HIIIGGGGGGGGIIDH',
    'HIIIGGGGGGGGIDDH',
    'HIIIGGGGGGGGIDDH',
    'HIIIGGIGGIGGDDDH',
    'HIIIIIIIIIIDDDDH',
    'HIDDDDDDDDDDDDDH',
    '.HHHHHHHHHHHHHH.',
  ],
  palette: { H: '#e8fbff', W: '#ffffff', I: '#7fd8ff', D: '#3a9fe0', G: '#d8f6ff', e: '#ffffff', k: '#1b2bd6' },
};

/** El protagonista (diseño propio) disparando el láser por la boca. */
const HERO_LASER: PixelIcon = {
  rows: [
    '.....yyy........',
    '...yyyyyyy......',
    '..yyyyyyyyy.....',
    '.yyyyyykkyyy....',
    '.yyyyyyyyy......',
    'yyyyyyyy..oooooo',
    'yyyyyyyooccccccc',
    'yyyyyyocWWWWWWWW',
    'yyyyyyyooccccccc',
    'yyyyyyyy..oooooo',
    '.yyyyyyyyy......',
    '.yyyyyyyyyyy....',
    '..yyyyyyyyy.....',
    '...yyyyyyy......',
    '.....yyy........',
  ],
  palette: { y: '#ffd51a', k: '#2a1a00', o: '#ff6a1a', c: '#ffb04a', W: '#fff4d0' },
};

const { longFright, ice, laser } = CONFIG.abilities;

/** Todas las habilidades que pueden salir en la tienda. Añadir una es añadir una entrada aquí. */
export const ABILITIES: readonly AbilityDef[] = [
  {
    id: 'long-fright',
    tier: 'basic',
    name: 'SUSTO LARGO',
    description: `LOS FANTASMAS ASUSTADOS POR UN ENERGIZADOR TARDAN ${longFright.frightBonus} S MAS EN RECUPERARSE`,
    maxLevel: 2,
    upgradeDescription: `OTROS ${longFright.frightBonus} S MAS DE SUSTO: +${longFright.frightBonus * 2} S EN TOTAL`,
    icon: SCARED_GHOST_CLOCK,
    effects: { frightBonus: longFright.frightBonus },
  },
  {
    id: 'ice',
    tier: 'epic',
    name: 'HIELO',
    description: `APARECEN CUBITOS DE HIELO. AL COGER UNO LOS FANTASMAS SE CONGELAN ${ice.freezeTime} S Y NO TE PUEDEN MATAR`,
    icon: FROZEN_GHOST,
    effects: { pickup: 'ice' },
  },
  {
    id: 'laser',
    tier: 'legendary',
    name: 'LASER',
    description: `APARECEN BOLAS NARANJAS. AL COMER UNA DISPARAS UN LASER POR LA BOCA DURANTE ${laser.duration} S QUE SE COME A LOS FANTASMAS`,
    maxLevel: 2,
    upgradeDescription: `EL LASER DURA ${laser.plusBonus} S MAS: ${laser.duration + laser.plusBonus} S EN TOTAL`,
    icon: HERO_LASER,
    effects: { pickup: 'laser' },
  },
];
