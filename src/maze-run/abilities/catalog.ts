import { CONFIG, type AbilityTier } from '../../config';

/** Niveles de habilidad, de más barato a más caro (orden de las casillas de la tienda). */
export const TIERS: readonly AbilityTier[] = ['basic', 'epic', 'legendary'];

/** Efectos que una habilidad suma a la partida (cada copia comprada vuelve a sumarlos). */
export interface AbilityEffects {
  /** Segundos extra que dura el susto de los energizadores. */
  frightBonus?: number;
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
  /** Efecto resumido en grande en la carta (p. ej. "+2 S"). */
  badge: string;
  description: string;
  icon: PixelIcon;
  effects: AbilityEffects;
}

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

const { longFright } = CONFIG.abilities;

/** Todas las habilidades que pueden salir en la tienda. Añadir una es añadir una entrada aquí. */
export const ABILITIES: readonly AbilityDef[] = [
  {
    id: 'long-fright',
    tier: 'basic',
    name: 'SUSTO LARGO',
    badge: `+${longFright.frightBonus} S`,
    description: `LOS FANTASMAS ASUSTADOS POR UN ENERGIZADOR TARDAN ${longFright.frightBonus} S MAS EN RECUPERARSE`,
    icon: SCARED_GHOST_CLOCK,
    effects: { frightBonus: longFright.frightBonus },
  },
];
