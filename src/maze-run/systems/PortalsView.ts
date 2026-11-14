import * as THREE from 'three';
import { ACTOR_Z, worldX } from '../world';
import type { Portal, Portals } from './Portals';

/** Píxeles del remolino por radio (aspecto pixel art). */
const SWIRL_PIXELS = 7;
const RADIUS = 0.95;
const PARTICLES = 10;
const CLOSE_TIME = 0.5;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Remolino en espiral de dos colores con núcleo blanco, cuantizado a píxeles gruesos. */
const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uSpin;
  uniform vec3 uA;
  uniform vec3 uB;
  varying vec2 vUv;
  void main() {
    vec2 p = floor((vUv * 2.0 - 1.0) * ${SWIRL_PIXELS}.0 + 0.5) / ${SWIRL_PIXELS}.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float band = step(0.0, sin(a * 3.0 + r * 9.0 - uTime * uSpin));
    vec3 col = mix(uA, uB, band) * mix(1.25, 0.55, r);
    col = mix(col, vec3(1.0), step(r, 0.2));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

interface PortalItem {
  portal: Portal;
  root: THREE.Group;
  ring: THREE.Mesh;
  ringInner: THREE.Mesh;
  particles: THREE.InstancedMesh;
  /** Tiempo desde que se cerró (-1 = abierto). */
  closing: number;
}

/**
 * Portales en 3D: remolino animado, anillo octogonal de color cambiante, otro
 * anillo interior en sentido contrario, una marca en el suelo y partículas voxel
 * que giran hacia el centro. Una sola luz (para no cambiar el número de luces de
 * la escena) ilumina el portal abierto más cercano a la cámara.
 */
export class PortalsView {
  readonly group = new THREE.Group();
  private items = new Map<number, PortalItem>();
  private swirl: THREE.ShaderMaterial;
  private ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private innerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private padMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
  private particleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private discGeometry = new THREE.CircleGeometry(RADIUS * 0.86, 24);
  private ringGeometry = new THREE.TorusGeometry(RADIUS, 0.13, 4, 8);
  private innerGeometry = new THREE.TorusGeometry(RADIUS * 0.7, 0.06, 4, 8);
  private padGeometry = new THREE.RingGeometry(RADIUS * 1.15, RADIUS * 1.55, 8);
  private cubeGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  private light = new THREE.PointLight(0xff4bd8, 0, 7, 1.4);
  private time = 0;
  private matrix = new THREE.Matrix4();
  /** Portal por el que se está entrando (gira más rápido y crece). */
  absorbing: Portal | null = null;
  private unsubscribe: Array<() => void>;

  constructor(portals: Portals) {
    this.swirl = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSpin: { value: 4 },
        uA: { value: new THREE.Color(0xff2bd6) },
        uB: { value: new THREE.Color(0x5a1aff) },
      },
      vertexShader,
      fragmentShader,
    });
    this.group.add(this.light);
    this.unsubscribe = [
      portals.events.on('added', (p) => this.add(p)),
      portals.events.on('removed', (p) => this.remove(p.id)),
      portals.events.on('closed', (p) => {
        const item = this.items.get(p.id);
        if (item) item.closing = 0;
      }),
    ];
  }

  private add(portal: Portal): void {
    const root = new THREE.Group();
    root.position.set(worldX(portal.x), portal.y, ACTOR_Z + 0.1);
    const disc = new THREE.Mesh(this.discGeometry, this.swirl);
    const ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
    const ringInner = new THREE.Mesh(this.innerGeometry, this.innerMaterial);
    ringInner.position.z = 0.05;
    const pad = new THREE.Mesh(this.padGeometry, this.padMaterial);
    pad.position.z = -(ACTOR_Z + 0.1) + 0.03; // sobre el suelo
    const particles = new THREE.InstancedMesh(this.cubeGeometry, this.particleMaterial, PARTICLES);
    particles.frustumCulled = false;
    root.add(disc, ring, ringInner, pad, particles);
    this.group.add(root);
    this.items.set(portal.id, { portal, root, ring, ringInner, particles, closing: -1 });
  }

  private remove(id: number): void {
    const item = this.items.get(id);
    if (!item) return;
    this.group.remove(item.root);
    item.particles.dispose();
    this.items.delete(id);
  }

  update(dt: number, focusY: number): void {
    this.time += dt;
    const t = this.time;
    // El anillo recorre todo el arcoíris: así no se confunde con el color único del laberinto.
    const hue = (t * 0.35) % 1;
    this.ringMaterial.color.setHSL(hue, 1, 0.6);
    this.innerMaterial.color.setHSL((hue + 0.5) % 1, 1, 0.65);
    this.padMaterial.color.setHSL(hue, 1, 0.5);
    this.particleMaterial.color.setHSL((hue + 0.25) % 1, 1, 0.7);
    this.swirl.uniforms.uTime.value = t;
    this.swirl.uniforms.uSpin.value = this.absorbing ? 12 : 4;

    let nearest: PortalItem | null = null;
    for (const item of this.items.values()) {
      const absorbing = this.absorbing === item.portal;
      let scale = 1 + Math.sin(t * 3 + item.portal.id) * 0.04;
      if (absorbing) scale = 1.25;
      if (item.closing >= 0) {
        item.closing += dt;
        const k = Math.max(0, 1 - item.closing / CLOSE_TIME);
        scale *= Math.ceil(k * 5) / 5; // se cierra en escalones
        item.root.visible = k > 0;
      } else if (!nearest || Math.abs(item.portal.y - focusY) < Math.abs(nearest.portal.y - focusY)) {
        nearest = item;
      }
      item.root.scale.setScalar(scale);
      item.ring.rotation.z = t * (absorbing ? -6 : -1.2);
      item.ringInner.rotation.z = t * (absorbing ? 8 : 2);
      this.updateParticles(item, absorbing);
    }

    if (nearest) {
      this.light.position.set(nearest.root.position.x, nearest.root.position.y, 2.2);
      this.light.color.setHSL(hue, 1, 0.6);
      this.light.intensity = 9 + Math.sin(t * 6) * 2;
    } else {
      this.light.intensity = 0;
    }
  }

  /** Cubitos que giran en espiral hacia el centro y renacen fuera. */
  private updateParticles(item: PortalItem, absorbing: boolean): void {
    const speed = absorbing ? 2.5 : 0.7;
    for (let i = 0; i < PARTICLES; i++) {
      const phase = (this.time * speed + i / PARTICLES) % 1;
      const r = RADIUS * (1.6 - phase * 1.4);
      const a = i * 2.4 + this.time * (absorbing ? 7 : 2.2) + phase * 3;
      const s = Math.ceil((1 - phase) * 3) / 3;
      this.matrix.makeScale(s, s, s).setPosition(Math.cos(a) * r, Math.sin(a) * r, 0.15);
      item.particles.setMatrixAt(i, this.matrix);
    }
    item.particles.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.unsubscribe.forEach((u) => u());
    [...this.items.keys()].forEach((id) => this.remove(id));
    this.swirl.dispose();
    [this.ringMaterial, this.innerMaterial, this.padMaterial, this.particleMaterial].forEach((m) => m.dispose());
    [this.discGeometry, this.ringGeometry, this.innerGeometry, this.padGeometry, this.cubeGeometry].forEach((g) => g.dispose());
    this.light.dispose();
  }
}
