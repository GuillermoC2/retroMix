import * as THREE from 'three';
import { buildVoxelGeometry, spriteFromRows, type VoxelSprite } from '../../render/voxel';
import type { Dir } from '../maze/grid';

/**
 * Pixel art de los personajes (diseños propios) convertido a geometría voxel 2.5D.
 * Las geometrías se cachean: se generan una vez por fotograma de animación.
 */

const cache = new Map<string, THREE.BufferGeometry>();
const cached = (key: string, build: () => THREE.BufferGeometry) => {
  let geo = cache.get(key);
  if (!geo) cache.set(key, (geo = build()));
  return geo;
};

// -----------------------------------------------------------------------------
// Protagonista: esfera pixelada que "come", con ojo y borde sombreado.
// -----------------------------------------------------------------------------

const HERO_SIZE = 15;
const HERO_YELLOW = 0xffd51a;
const HERO_RIM = 0xe89a00;
const HERO_EYE = 0x2a1a00;
export const HERO_VOXEL = 0.88 / HERO_SIZE;

/**
 * @param mouth apertura total de la boca en radianes (0 = cerrada, 2π = desaparecido).
 */
export function heroGeometry(mouth: number): THREE.BufferGeometry {
  const deg = Math.round((mouth * 180) / Math.PI);
  return cached(`hero:${deg}`, () => {
    const c = (HERO_SIZE - 1) / 2;
    const r = HERO_SIZE / 2 + 0.1;
    const half = (deg * Math.PI) / 360;
    const inside = (x: number, y: number) => {
      const dx = x - c;
      const dy = y - c;
      if (dx * dx + dy * dy > r * r) return false;
      if (dx === 0 && dy === 0) return deg < 350;
      return Math.abs(Math.atan2(dy, dx)) > half;
    };
    const sprite: VoxelSprite = {
      width: HERO_SIZE,
      height: HERO_SIZE,
      color: (x, y) => {
        if (!inside(x, y)) return null;
        if (x === c + 1 && y === c + 4 && half < 1.2) return HERO_EYE;
        const rim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        const dist = Math.hypot(x - c, y - c);
        return rim && dist > r - 1.5 ? HERO_RIM : HERO_YELLOW;
      },
      halfDepth: (x, y) => {
        const d2 = (x - c) ** 2 + (y - c) ** 2;
        return Math.round(Math.sqrt(Math.max(0, r * r - d2)) * 0.6);
      },
    };
    return buildVoxelGeometry(sprite, HERO_VOXEL);
  });
}

// -----------------------------------------------------------------------------
// Fantasmas: cúpula con faldón ondulado de 3 lóbulos y ojos que miran.
// -----------------------------------------------------------------------------

const GHOST_BODY = [
  '.....####.....',
  '...########...',
  '..##########..',
  '.############.',
  '.############.',
  '##############',
  '##############',
  '##############',
  '##############',
  '##############',
  '##############',
  '##############',
  '##############',
];
const GHOST_SKIRT = ['###..####..###', '.###..##..###.'];
export const GHOST_VOXEL = 0.9 / 14;

const EYE_WHITE = 0xf4f4ff;
const PUPIL = 0x1b2bd6;

export const SCARED_BODY = 0x2a35e0;
export const SCARED_FACE = 0xffc4a8;
export const FLASH_BODY = 0xf0f0ff;
export const FLASH_FACE = 0xff2a2a;

export interface GhostLook {
  /** Color del cuerpo o null para dibujar solo los ojos (fantasma comido). */
  body: number | null;
  frame: 0 | 1;
  /** Dirección de la mirada, o 'scared' para la cara de miedo. */
  face: Dir | 'scared';
  faceColor?: number;
}

export function ghostGeometry(look: GhostLook): THREE.BufferGeometry {
  const key = `ghost:${look.body}:${look.frame}:${look.face}:${look.faceColor}`;
  return cached(key, () => {
    const rows = [...GHOST_BODY, GHOST_SKIRT[look.frame]].map((r) => r.replace(/#/g, look.body === null ? '.' : 'B').split(''));
    const put = (x: number, yTop: number, ch: string) => {
      if (rows[yTop]?.[x] !== undefined) rows[yTop][x] = ch;
    };

    if (look.face === 'scared') {
      for (const ex of [4, 9]) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(ex + dx, 4 + dy, 'F');
      [2, 4, 6, 8, 10].forEach((x) => put(x + 1, 9, 'F'));
      [2, 4, 6, 8, 10, 12].forEach((x) => put(x, 10, 'F'));
    } else {
      const lookX = [0, 1, 0, -1][look.face];
      const lookY = [-1, 0, 1, 0][look.face]; // fila superior = índice 0
      for (const ex of [2, 8]) {
        const x0 = ex + lookX;
        const y0 = 4 + lookY;
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
          if ((dx === 0 || dx === 3) && (dy === 0 || dy === 3)) continue; // esquinas redondeadas
          put(x0 + dx, y0 + dy, 'W');
        }
        const px = x0 + 1 + lookX;
        const py = y0 + 1 + lookY;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(px + dx, py + dy, 'P');
      }
    }

    const palette: Record<string, number> = { W: EYE_WHITE, P: PUPIL, F: look.faceColor ?? SCARED_FACE };
    if (look.body !== null) palette.B = look.body;
    const width = 14;
    const bodyDepth = (x: number) => Math.round(Math.sqrt(Math.max(0, 49 - (x - 6.5) ** 2)) * 0.5);
    const sprite = spriteFromRows(
      rows.map((r) => r.join('')),
      palette,
      (x, y) => {
        const ch = rows[rows.length - 1 - y][x];
        // Ojos y cara sobresalen un vóxel por delante del cuerpo.
        return ch === 'B' ? bodyDepth(x) : look.body === null ? 1 : bodyDepth(x) + 1;
      },
    );
    sprite.width = width;
    return buildVoxelGeometry(sprite, GHOST_VOXEL);
  });
}

// -----------------------------------------------------------------------------
// Puntos
// -----------------------------------------------------------------------------

export const DOT_COLOR = 0xffc9a0;

export function energizerGeometry(): THREE.BufferGeometry {
  return cached('energizer', () => {
    const n = 7;
    const c = (n - 1) / 2;
    const sprite: VoxelSprite = {
      width: n,
      height: n,
      color: (x, y) => ((x - c) ** 2 + (y - c) ** 2 <= 10.5 ? DOT_COLOR : null),
      halfDepth: (x, y) => Math.round(Math.sqrt(Math.max(0, 10.5 - (x - c) ** 2 - (y - c) ** 2))),
    };
    return buildVoxelGeometry(sprite, 0.065);
  });
}
