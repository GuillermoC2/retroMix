import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * WebGLRenderer que dibuja a baja resolución y se escala con interpolación
 * "nearest" (CSS image-rendering: pixelated) para conseguir el aspecto pixel art.
 */
export class PixelRenderer {
  readonly three: THREE.WebGLRenderer;
  private listeners: Array<(aspect: number) => void> = [];
  aspect = 1;

  constructor(container: HTMLElement) {
    this.three = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.three.setPixelRatio(1);
    this.three.outputColorSpace = THREE.SRGBColorSpace;
    this.three.shadowMap.enabled = CONFIG.render.shadows;
    this.three.shadowMap.type = THREE.BasicShadowMap;
    const canvas = this.three.domElement;
    canvas.classList.add('game-canvas');
    container.appendChild(canvas);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Factor entre píxeles de pantalla y píxeles del framebuffer interno. */
  get pixelScale(): number {
    const { targetPixelHeight, minPixelScale, maxPixelScale } = CONFIG.render;
    const raw = Math.round((window.innerHeight * window.devicePixelRatio) / targetPixelHeight);
    return Math.min(maxPixelScale, Math.max(minPixelScale, raw));
  }

  onResize(fn: (aspect: number) => void): () => void {
    this.listeners.push(fn);
    fn(this.aspect);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scale = this.pixelScale / window.devicePixelRatio;
    this.three.setSize(Math.max(1, Math.floor(w / scale)), Math.max(1, Math.floor(h / scale)), false);
    this.aspect = w / h;
    this.listeners.forEach((fn) => fn(this.aspect));
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.three.render(scene, camera);
  }
}
