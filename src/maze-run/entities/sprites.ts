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
// Protagonista: disco plano pixelado que "come", con ojo y borde sombreado.
// Grosor uniforme (como una chapa): de frente es el sprite, de lado un canto recto.
// -----------------------------------------------------------------------------

const HERO_SIZE = 15;
const HERO_YELLOW = 0xffd51a;
const HERO_RIM = 0xe89a00;
const HERO_EYE = 0x2a1a00;
export const HERO_VOXEL = 0.88 / HERO_SIZE;
/** Diámetro del protagonista en casillas (a escala 1). */
export const HERO_DIAMETER = HERO_VOXEL * HERO_SIZE;
/** Mitad del grosor en vóxeles: 1 → 3 vóxeles de grosor. El ojo sobresale uno más por cada cara. */
const HERO_HALF_DEPTH = 1;

/** Aspecto del protagonista: normal, gris oscuro con el ojo rojo (poder GHOUL) o azulado (habilidad DASH). */
export type HeroLook = 'normal' | 'ghoul' | 'dash';

/** Colores del protagonista con DASH (azulado). */
const DASH_LOOK = { body: 0x6fc8ff, rim: 0x2a7fd8 };

/** Aspecto del poder GHOUL: cuerpo gris oscuro, ojo de esclerótica negra e iris rojo y venas rojas alrededor. */
const GHOUL = {
  body: 0x3b3b46,
  rim: 0x23232b,
  sclera: 0x050508,
  iris: 0xff1f2e,
  vein: 0xc8102a,
};

/**
 * @param mouth apertura total de la boca en radianes (0 = cerrada, 2π = desaparecido).
 * @param look aspecto normal o con máscara.
 */
export function heroGeometry(mouth: number, look: HeroLook = 'normal'): THREE.BufferGeometry {
  const deg = Math.round((mouth * 180) / Math.PI);
  return cached(`hero:${deg}:${look}`, () => {
    const c = (HERO_SIZE - 1) / 2;
    const r = HERO_SIZE / 2 + 0.1;
    const half = (deg * Math.PI) / 360;
    const ghoul = look === 'ghoul';
    const inCircle = (x: number, y: number) => (x - c) ** 2 + (y - c) ** 2 <= r * r;
    const inMouth = (x: number, y: number) => {
      const dx = x - c;
      const dy = y - c;
      if (dx === 0 && dy === 0) return deg >= 350;
      return Math.abs(Math.atan2(dy, dx)) <= half;
    };
    const inside = (x: number, y: number) => inCircle(x, y) && !inMouth(x, y);
    const isEye = (x: number, y: number) => !ghoul && x === c + 1 && y === c + 4 && half < 1.2;
    // Ojo del GHOUL: 3×3 (esclerótica negra con iris rojo en el centro).
    const ghoulEye = (x: number, y: number) => ghoul && half < 1.2 && x >= c && x <= c + 2 && y >= c + 3 && y <= c + 5;
    const veins = new Set([`${c + 3},${c + 5}`, `${c + 4},${c + 6}`, `${c + 3},${c + 2}`, `${c - 1},${c + 5}`, `${c - 2},${c + 6}`, `${c + 1},${c + 6}`]);
    const sprite: VoxelSprite = {
      width: HERO_SIZE,
      height: HERO_SIZE,
      color: (x, y) => {
        if (!inside(x, y)) return null;
        if (isEye(x, y)) return HERO_EYE;
        if (ghoulEye(x, y)) return x === c + 1 && y === c + 4 ? GHOUL.iris : GHOUL.sclera;
        if (ghoul && veins.has(`${x},${y}`)) return GHOUL.vein;
        const rim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        const dist = Math.hypot(x - c, y - c);
        const edge = rim && dist > r - 1.5;
        if (ghoul) return edge ? GHOUL.rim : GHOUL.body;
        if (look === 'dash') return edge ? DASH_LOOK.rim : DASH_LOOK.body;
        return edge ? HERO_RIM : HERO_YELLOW;
      },
      halfDepth: (x, y) => HERO_HALF_DEPTH + (isEye(x, y) || ghoulEye(x, y) ? 1 : 0),
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
    // Relieve suave (máx. 2 vóxeles de media profundidad; antes 3), a juego con el protagonista plano.
    const bodyDepth = (x: number) => Math.round(Math.sqrt(Math.max(0, 49 - (x - 6.5) ** 2)) * 0.3);
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

// -----------------------------------------------------------------------------
// Cereza (la come el protagonista en la cinemática del poder GIGANTE)
// -----------------------------------------------------------------------------

const CHERRY = [
  '.......gLLL.',
  '.......g.LL.',
  '......g.g...',
  '.....g...g..',
  '....g....g..',
  '...g.....g..',
  '.RRR....RRR.',
  'RRhRR..RRhRR',
  'RhRRR..RhRRR',
  'RRRRR..RRRRR',
  'RRRRD..RRRRD',
  '.RDD....RDD.',
];
export const CHERRY_VOXEL = 0.05;

export function cherryGeometry(): THREE.BufferGeometry {
  return cached('cherry', () => {
    const palette = { R: 0xff2e3a, h: 0xffd0d0, D: 0xa0101e, g: 0x8a6a1a, L: 0x39d65a };
    const fruit = new Set(['R', 'h', 'D']);
    const sprite = spriteFromRows(CHERRY, palette, (x, y) => (fruit.has(CHERRY[CHERRY.length - 1 - y][x]) ? 1 : 0));
    return buildVoxelGeometry(sprite, CHERRY_VOXEL);
  });
}

// -----------------------------------------------------------------------------
// Cubito de hielo (habilidad HIELO) y fantasma congelado
// -----------------------------------------------------------------------------

const ICE_CUBE = [
  '.HHHHHHH.',
  'HWWIIIIIH',
  'HWIIIIIIH',
  'HIIIIIIDH',
  'HIIIIIIDH',
  'HIIIIIDDH',
  'HIIIIDDDH',
  'HIDDDDDDH',
  '.HHHHHHH.',
];
export const ICE_COLOR = 0x7fd8ff;
/** Cuerpo de un fantasma congelado. */
export const ICE_BODY = 0xb4ecff;

export function iceCubeGeometry(): THREE.BufferGeometry {
  return cached('ice-cube', () => {
    const palette = { H: 0xa8e8ff, W: 0xffffff, I: 0x4cc4ff, D: 0x1f7fd8 };
    const sprite = spriteFromRows(ICE_CUBE, palette, () => 3);
    return buildVoxelGeometry(sprite, 0.08);
  });
}

// -----------------------------------------------------------------------------
// Bola de energía (habilidad LASER)
// -----------------------------------------------------------------------------

export const LASER_COLOR = 0xff6a1a;

export function laserOrbGeometry(): THREE.BufferGeometry {
  return cached('laser-orb', () => {
    const n = 9;
    const c = (n - 1) / 2;
    const r2 = 4.6 ** 2;
    const sprite: VoxelSprite = {
      width: n,
      height: n,
      color: (x, y) => {
        const d2 = (x - c) ** 2 + (y - c) ** 2;
        if (d2 > r2) return null;
        // Brillo arriba a la izquierda, borde rojo oscuro abajo a la derecha.
        if ((x - 2.6) ** 2 + (y - 5.6) ** 2 <= 1.6) return 0xffd9a0;
        if (d2 > 3.4 ** 2 && x + (n - 1 - y) > n) return 0xc0280e;
        return d2 < 2.2 ** 2 ? 0xff8a2a : LASER_COLOR;
      },
      halfDepth: (x, y) => Math.round(Math.sqrt(Math.max(0, r2 - (x - c) ** 2 - (y - c) ** 2)) * 0.8),
    };
    return buildVoxelGeometry(sprite, 0.07);
  });
}

// -----------------------------------------------------------------------------
// Pluma (habilidad DASH) e imán (habilidad IMAN)
// -----------------------------------------------------------------------------

const FEATHER = [
  '.........',
  '.......ls',
  '.....lwsd',
  '....lwsd.',
  '..lwwsd..',
  '..lwsd...',
  '.lwsd....',
  '.ls......',
  '.s.......',
];
export const FEATHER_COLOR = 0x7fc0ff;

export function featherGeometry(): THREE.BufferGeometry {
  return cached('feather', () => {
    const palette = { s: 0xf0f8ff, w: 0xb4e0ff, l: 0x5aa8ff, d: 0x2a6fd0 };
    const sprite = spriteFromRows(FEATHER, palette, () => 0);
    return buildVoxelGeometry(sprite, 0.075);
  });
}

const MAGNET = [
  'SS.....SS',
  'GG.....GG',
  'hR.....hR',
  'hR.....hR',
  'hR.....hD',
  'hRR...RRD',
  '.hRRRRRD.',
  '..DRRRD..',
];
export const MAGNET_COLOR = 0xff3a3a;

export function magnetGeometry(): THREE.BufferGeometry {
  return cached('magnet', () => {
    const palette = { S: 0xe8ecf8, G: 0x9aa0b4, R: MAGNET_COLOR, h: 0xff8a8a, D: 0xb01a2a };
    const sprite = spriteFromRows(MAGNET, palette, () => 1);
    return buildVoxelGeometry(sprite, 0.07);
  });
}
