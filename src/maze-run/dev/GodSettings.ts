/**
 * Trucos de desarrollo del modo dios. Se guardan en localStorage para que
 * sobrevivan a las recargas mientras se desarrolla (si no hay almacenamiento,
 * funcionan solo en memoria).
 */
export interface GodSettings {
  /** Ni los fantasmas, ni la lava, ni perder un minijuego matan. */
  invincible: boolean;
  /** Romper muro (Espacio) sin gastar cargas. */
  infiniteWallBreak: boolean;
}

const KEY = 'retromix:god';
const DEFAULTS: GodSettings = { invincible: false, infiniteWallBreak: false };

function load(): GodSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
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

/** ¿Hay algún truco activo? (una partida con trucos no guarda récords). */
export const anyCheat = (): boolean => godSettings.invincible || godSettings.infiniteWallBreak;
