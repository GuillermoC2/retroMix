import * as THREE from 'three';
import { CONFIG } from '../config';

const DEG = Math.PI / 180;

/**
 * Cámara en perspectiva que sigue al jugador hacia arriba y orbita alrededor
 * del punto de mira según la vista elegida (tecla C). La distancia se calcula
 * para que siempre quepan el ancho del laberinto y las filas configuradas.
 * También mueve la luz direccional (y su sombra) con el encuadre.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly light: THREE.DirectionalLight;
  readonly focus = new THREE.Vector3(0, 0, CONFIG.maze.wallDepth * 0.5);
  viewIndex = 0;
  /** Mitad de la altura visible (en filas) a la distancia del punto de mira, en vista frontal. */
  halfHeight = CONFIG.camera.visibleRows / 2;
  private yaw: number;
  private tilt: number;
  private shakeAmount = 0;

  constructor() {
    const cfg = CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(cfg.fov, 1, 0.5, 200);
    this.yaw = cfg.views[0].yaw * DEG;
    this.tilt = cfg.views[0].tilt * DEG;

    this.light = new THREE.DirectionalLight(0xfff2e0, 2.2);
    this.light.castShadow = CONFIG.render.shadows;
    const s = this.light.shadow;
    s.mapSize.set(1024, 2048);
    Object.assign(s.camera, { left: -15, right: 15, top: 26, bottom: -26, near: 1, far: 60 });
    s.bias = -0.002;
  }

  get viewName(): string {
    return CONFIG.camera.views[this.viewIndex].name;
  }

  cycleView(): string {
    this.viewIndex = (this.viewIndex + 1) % CONFIG.camera.views.length;
    return this.viewName;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Coloca la cámara de golpe (inicio de partida). */
  snap(focusY: number): void {
    this.focus.y = focusY;
    this.apply();
  }

  /** Sacudida breve (amplitud en casillas) que se atenúa sola. */
  shake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** `focusY` lo decide quien controla el avance (AutoScroll); aquí solo se encuadra. */
  update(dt: number, focusY: number): void {
    const cfg = CONFIG.camera;
    this.focus.y = focusY;
    this.shakeAmount *= Math.exp(-dt * 14);
    if (this.shakeAmount < 0.005) this.shakeAmount = 0;

    const view = cfg.views[this.viewIndex];
    const blend = 1 - Math.exp(-dt * cfg.transitionSharpness);
    this.yaw += (view.yaw * DEG - this.yaw) * blend;
    this.tilt += (view.tilt * DEG - this.tilt) * blend;
    this.apply();
  }

  private apply(): void {
    const cfg = CONFIG.camera;
    const tanHalf = Math.tan((cfg.fov * DEG) / 2);
    const fitRows = cfg.visibleRows / (2 * tanHalf);
    const fitWidth = (CONFIG.maze.width + cfg.sideMargin * 2) / (2 * tanHalf * this.camera.aspect);
    const dist = Math.max(fitRows, fitWidth);
    this.halfHeight = dist * tanHalf;

    const { focus, yaw, tilt } = this;
    this.camera.position.set(
      focus.x + Math.sin(yaw) * Math.cos(tilt) * dist,
      focus.y + Math.sin(tilt) * dist,
      focus.z + Math.cos(yaw) * Math.cos(tilt) * dist,
    );
    this.camera.lookAt(focus);
    if (this.shakeAmount > 0) {
      const s = this.shakeAmount;
      this.camera.position.x += (Math.random() * 2 - 1) * s;
      this.camera.position.y += (Math.random() * 2 - 1) * s;
    }

    // Luz desde arriba a la derecha y por delante: sombras hacia abajo-izquierda.
    this.light.position.set(focus.x + 7, focus.y + 9, focus.z + 18);
    this.light.target.position.copy(focus);
    this.light.target.updateMatrixWorld();
  }
}
