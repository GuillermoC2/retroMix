import * as THREE from 'three';

export type RGB = readonly [number, number, number];

export const hexRGB = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

/** Lienzo RGBA simple con origen arriba-izquierda, convertible a textura "nearest". */
export class PixelCanvas {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4);
  }

  /** (x, y) con y = 0 arriba. */
  set(x: number, y: number, [r, g, b]: RGB, a = 255): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    // DataTexture guarda la fila 0 abajo: invertimos Y.
    const i = ((this.height - 1 - y) * this.width + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }

  toTexture(repeat = false): THREE.DataTexture {
    const tex = new THREE.DataTexture(this.data, this.width, this.height, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }
}
