import { CONFIG } from '../config';

/** Conversión casillas → coordenadas de mundo 3D. Y del mundo = fila; X centrada en el laberinto. */
export const worldX = (tileX: number) => tileX - (CONFIG.maze.width - 1) / 2;
export const worldY = (tileY: number) => tileY;

/** Altura (Z) a la que se dibujan personajes y puntos: a media pared. */
export const ACTOR_Z = CONFIG.maze.wallDepth * 0.52;
