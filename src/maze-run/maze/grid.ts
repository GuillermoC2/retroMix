/** Tipos básicos de la rejilla del laberinto: casillas y direcciones. */

/** `Gate`: muro portal (bloquea a todos y es irrompible hasta superar su minijuego). */
export const Tile = { Open: 0, Wall: 1, Gate: 2 } as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

/** 0 = arriba, 1 = derecha, 2 = abajo, 3 = izquierda (Y crece hacia arriba). */
export type Dir = 0 | 1 | 2 | 3;
export const Dir = { Up: 0, Right: 1, Down: 2, Left: 3 } as const satisfies Record<string, Dir>;
export const DIRS: readonly Dir[] = [0, 1, 2, 3];
export const DX = [0, 1, 0, -1] as const;
export const DY = [1, 0, -1, 0] as const;

export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;
export const isHorizontal = (d: Dir): boolean => d === Dir.Left || d === Dir.Right;

/** Ángulo (radianes) hacia el que mira algo que se mueve en la dirección `d`, con 0 = derecha. */
export const dirAngle = (d: Dir): number => [Math.PI / 2, 0, -Math.PI / 2, Math.PI][d];
