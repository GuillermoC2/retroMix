import * as THREE from 'three';
import { CONFIG } from '../../config';
import { PixelCanvas, hexRGB } from '../../render/pixelTextures';
import type { Lava } from './Lava';

const DEPTH_BELOW = 40;
const PIXELS_PER_TILE = 8;

const vertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying float vTop;
  float wave(float x) {
    float w = sin(x * 1.7 + uTime * 2.2) * 0.09 + sin(x * 3.1 - uTime * 3.3) * 0.05;
    return floor(w * ${PIXELS_PER_TILE}.0 + 0.5) / ${PIXELS_PER_TILE}.0;
  }
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vTop = step(${DEPTH_BELOW / 2 - 0.01}, position.y);
    float px = floor(world.x * ${PIXELS_PER_TILE / 2}.0) / ${PIXELS_PER_TILE / 2}.0;
    world.y += vTop * wave(px);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uSurface;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    // Cuantizar a la rejilla de píxeles del mundo para el aspecto pixel art.
    vec2 p = floor(vec2(vWorld.x, vWorld.y + vWorld.z * 0.6) * ${PIXELS_PER_TILE}.0) / ${PIXELS_PER_TILE}.0;
    float depth = uSurface - p.y;
    float n = noise(p * 1.3 + vec2(uTime * 0.25, -uTime * 0.6)) * 0.6
            + noise(p * 3.1 + vec2(-uTime * 0.5, uTime * 0.3)) * 0.4;
    float heat = n - clamp(depth * 0.12, 0.0, 0.45) + 0.12;
    // Trama ordenada 2x2 para transiciones pixeladas entre colores.
    vec2 cell = mod(floor(p * ${PIXELS_PER_TILE}.0), 2.0);
    heat += (cell.x * 0.5 + cell.y * 0.25 - 0.375) * 0.12;
    vec3 c0 = vec3(0.30, 0.03, 0.02);
    vec3 c1 = vec3(0.62, 0.08, 0.02);
    vec3 c2 = vec3(0.92, 0.27, 0.03);
    vec3 c3 = vec3(1.00, 0.56, 0.08);
    vec3 c4 = vec3(1.00, 0.86, 0.35);
    vec3 col = heat < 0.30 ? c0 : heat < 0.45 ? c1 : heat < 0.60 ? c2 : heat < 0.75 ? c3 : c4;
    // Costra brillante en la superficie.
    if (depth < 0.2) col = mix(c4, c3, step(0.1, depth));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Lava: bloque con shader animado, halo de calor por encima y una luz que tiñe las paredes cercanas. */
export class LavaView {
  readonly group = new THREE.Group();
  private body: THREE.Mesh;
  private glow: THREE.Mesh;
  private light: THREE.PointLight;
  private material: THREE.ShaderMaterial;
  private time = 0;

  constructor() {
    const width = CONFIG.maze.width + 1;
    const geo = new THREE.BoxGeometry(width, DEPTH_BELOW, CONFIG.maze.wallDepth + 0.5, width * 4, 1, 4);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSurface: { value: 0 } },
      vertexShader,
      fragmentShader,
    });
    this.body = new THREE.Mesh(geo, this.material);

    const glowTex = new PixelCanvas(1, 12);
    for (let j = 0; j < 12; j++) glowTex.set(0, j, hexRGB(0xff3c00), Math.round(85 * (j / 11) ** 2));
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(width, 4),
      new THREE.MeshBasicMaterial({ map: glowTex.toTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );

    this.light = new THREE.PointLight(0xff6a1a, 18, 9, 1.4);
    this.group.add(this.body, this.glow, this.light);
  }

  update(dt: number, lava: Lava): void {
    this.time += dt;
    const top = lava.y; // misma referencia que usa Lava.touches()
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uSurface.value = top;
    this.body.position.set(0, top - DEPTH_BELOW / 2, (CONFIG.maze.wallDepth + 0.5) / 2 - 0.15);
    this.glow.position.set(0, top + 2, CONFIG.maze.wallDepth + 0.12);
    this.light.position.set(0, top + 1.2, 2.5);
    this.light.intensity = 16 + Math.sin(this.time * 7) * 2 + Math.sin(this.time * 13) * 1.5;
  }

  dispose(): void {
    this.body.geometry.dispose();
    this.material.dispose();
    this.glow.geometry.dispose();
    const gm = this.glow.material as THREE.MeshBasicMaterial;
    gm.map?.dispose();
    gm.dispose();
  }
}
