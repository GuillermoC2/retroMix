/**
 * Trucos de desarrollo del modo dios. Se guardan en localStorage para que
 * sobrevivan a las recargas mientras se desarrolla (si no hay almacenamiento,
 * funcionan solo en memoria).
 */
export interface GodSettings {
  /** Ni los fantasmas, ni la lava, ni perder un minijuego matan. */
  invincible: boolean;
  /** ROMPEMUROS (Z) sin gastar usos. */
  infiniteWallBreak: boolean;
  /** Saltar los minijuegos de portales y muros dándolos por ganados o perdidos. */
  skipMinigames: SkipMinigames;
}

export type SkipMinigames = 'off' | 'win' | 'lose';
export const SKIP_MINIGAMES: readonly SkipMinigames[] = ['off', 'win', 'lose'];

const KEY = 'retromix:god';
const DEFAULTS: GodSettings = { invincible: false, infiniteWallBreak: false, skipMinigames: 'off' };

function load(): GodSettings {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    if (!SKIP_MINIGAMES.includes(s.skipMinigames)) s.skipMinigames = 'off';
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

export const godSettings: GodSettings = load();

export function saveGodSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(godSettings));
  } catch {
    // Sin almacenamiento: los ajustes duran hasta recargar.
  }
}

/** ¿Hay algún truco activo que dé ventaja? (una partida con trucos no guarda récords). */
export const anyCheat = (): boolean =>
  godSettings.invincible || godSettings.infiniteWallBreak || godSettings.skipMinigames === 'win';
