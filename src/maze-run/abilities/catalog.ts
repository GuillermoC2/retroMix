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
  /** ROMPEMUROS que se dan al comprarla (cada nivel). */
  wallBreaksOnBuy?: number;
  /** ROMPEMUROS extra cada vez que se supera un muro portal. */
  wallBreaksPerGate?: number;
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

/** Pluma azul con la estela de un dash. */
const DASH_FEATHER: PixelIcon = {
  rows: [
    '................',
    '..............ls',
    '............lwsd',
    '..........lwwsd.',
    '.........lwwsbd.',
    '.......lwwwsbd..',
    '......lwwwsbbd..',
    '.....lwwwsbd....',
    '.....lwwsbd.....',
    '...lwwwsbd......',
    '...lwwsbd.......',
    '...lwsd.........',
    '...ls...........',
    '...s............',
    '..s.............',
  ],
  palette: { s: '#f0f8ff', w: '#b4e0ff', l: '#5aa8ff', b: '#7fc0ff', d: '#2a6fd0' },
};

/** Imán de herradura. */
const MAGNET_ICON: PixelIcon = {
  rows: [
    'SSSSS......SSSSS',
    'SSSSS......SSSSS',
    'GGGGG......GGGGG',
    'hRRRR......hRRRR',
    'hRRRR......hRRRR',
    'hRRRR......hRRRR',
    'hRRRR......hRRRD',
    'hRRRR......hRRRD',
    'hRRRRR....RRRRRD',
    '.hRRRRR..RRRRRD.',
    '.hRRRRRRRRRRRRD.',
    '..hRRRRRRRRRRD..',
    '..DRRRRRRRRRRD..',
    '....DDRRRRDD....',
    '.....DDDDDD.....',
  ],
  palette: { S: '#e8ecf8', G: '#9aa0b4', R: '#ff3a3a', h: '#ff8a8a', D: '#b01a2a' },
};

/** Muro de bloques neón que se rompe, con un "+". */
const BREAKING_WALL: PixelIcon = {
  rows: [
    '............W...',
    '...........WWW..',
    '............W...',
    'BBBBBBbBBBBBB...',
    'BBBBBBbBBBBBB.y.',
    'bbbbbbbbbbbb..y.',
    'BBbBBBBBkBB.....',
    'BBbBBBBkk.....B.',
    'bbbbbbbk........',
    'BBBBBbBk.....BB.',
    'BBBBBbBBk.......',
    'bbbbbbbbbk...y..',
    'BBbBBBBBbBBk....',
    'BBbBBBBBbBBBk...',
    'bbbbbbbbbbbbbb..',
  ],
  palette: { B: '#3ae8ff', b: '#0e6a8a', k: '#05051a', y: '#ffd51a', W: '#f4f4ff' },
};

/** Fantasma verde (aliado) con un corazón. */
const FRIEND_GHOST: PixelIcon = {
  rows: [
    '..........hh.hh.',
    '....#####hhhhhhh',
    '...#######hhhhh.',
    '..#########.hhh.',
    '.###########.h..',
    '.##ww####ww##...',
    '##wwpp##wwpp##..',
    '##wwpp##wwpp##..',
    '###ww####ww###..',
    '##############..',
    '##############..',
    '##############..',
    '##############..',
    '##.###..###.##..',
    '#...#....#...#..',
  ],
  palette: { '#': '#3aff8a', w: '#ffffff', p: '#1b2bd6', h: '#ff5ad8' },
};

/** Reloj de arena dorado. */
const HOURGLASS_ICON: PixelIcon = {
  rows: [
    '..GGGGGGGGGGGG..',
    '...gwwwwwwwwg...',
    '...gwSSSSSSwg...',
    '....gwSSSSwg....',
    '.....gwSSwg.....',
    '......gSSg......',
    '.......gg.......',
    '......gwSg......',
    '.....gw.S.g.....',
    '....gw..S..g....',
    '...gw..SSS..g...',
    '...gwSSSSSSSg...',
    '...gSSSSSSSSg...',
    '..GGGGGGGGGGGG..',
    '..DDDDDDDDDDDD..',
  ],
  palette: { G: '#ffc21a', D: '#a06a00', g: '#9fe6ff', w: '#e8fbff', S: '#ffe08a' },
};

const { longFright, ice, laser, dash, magnet, moreWallBreaks, friend, slowTime } = CONFIG.abilities;

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
  {
    id: 'dash',
    tier: 'epic',
    name: 'DASH',
    description: `APARECEN PLUMAS. AL COGER UNA TE VUELVES AZUL ${dash.duration} S Y CON X HACES UN DASH QUE MATA A LOS FANTASMAS QUE TOCAS (RECARGA ${dash.cooldown} S)`,
    icon: DASH_FEATHER,
    effects: { pickup: 'dash' },
  },
  {
    id: 'magnet',
    tier: 'basic',
    name: 'IMAN',
    description: `APARECEN IMANES. AL COGER UNO ATRAES LOS PUNTOS CERCANOS DURANTE ${magnet.duration} S (NO LOS GRANDES)`,
    maxLevel: 2,
    upgradeDescription: `EL IMAN DURA ${magnet.plusBonus} S MAS: ${magnet.duration + magnet.plusBonus} S EN TOTAL`,
    icon: MAGNET_ICON,
    effects: { pickup: 'magnet' },
  },
  {
    id: 'more-wall-breaks',
    tier: 'basic',
    name: 'MAS ROMPEMUROS',
    description: `+${moreWallBreaks.onBuy} ROMPEMUROS AHORA Y +${moreWallBreaks.perGate} MAS CADA VEZ QUE SUPERAS UN MURO PORTAL`,
    icon: BREAKING_WALL,
    effects: { wallBreaksOnBuy: moreWallBreaks.onBuy, wallBreaksPerGate: moreWallBreaks.perGate },
  },
  {
    id: 'friend',
    tier: 'epic',
    name: 'FANTASMA AMIGO',
    description: `APARECEN CORAZONES. AL COGER UNO EL FANTASMA MAS CERCANO SE HACE TU AMIGO ${friend.duration} S Y SE COME A LOS DEMAS`,
    icon: FRIEND_GHOST,
    effects: { pickup: 'friend' },
  },
  {
    id: 'slow-time',
    tier: 'legendary',
    name: 'TIEMPO LENTO',
    description: `APARECEN RELOJES DE ARENA. AL COGER UNO TODO MENOS TU VA A CAMARA LENTA DURANTE ${slowTime.duration} S: FANTASMAS, LAVA Y PANTALLA`,
    icon: HOURGLASS_ICON,
    effects: { pickup: 'slow' },
  },
];
