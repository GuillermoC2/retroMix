import * as THREE from 'three';
import { CONFIG } from '../../config';
import { worldX } from '../world';
import { gateCenterY, type Gate, type Gates } from './Gates';

/** Píxeles por casilla del campo de energía (como las texturas del laberinto). */
const FIELD_PIXELS = 8;
/** Alturas (Z): campo de energía (justo por encima de los muros), barandillas y pilares. */
const FIELD_Z = CONFIG.maze.wallDepth + 0.06;
const RAIL_Z = CONFIG.maze.wallDepth + 0.28;
const PILLAR_Z = CONFIG.maze.wallDepth + 0.75;
const RING_RADIUS = 1.0;
/** Posición X (mundo) de los dos emblemas, a los lados del cartel con el nombre del minijuego. */
const EMBLEM_X = 4.5;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Campo de energía pixelado: flechas (chevrones) que suben, con el tono del
 * arcoíris recorriendo el muro, bordes brillantes y destellos sueltos. `uOpen`
 * lo disuelve píxel a píxel al abrirse; `uBoost` lo acelera y aviva al entrar.
 */
const fieldShader = /* glsl */ `
  uniform float uTime;
  uniform vec2 uSize;
  uniform float uHue;
  uniform float uOpen;
  uniform float uBoost;
  varying vec2 vUv;

  vec3 hsv(float h, float s, float v) {
    vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return v * mix(vec3(1.0), k, s);
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec2 cell = floor(vUv * uSize * ${FIELD_PIXELS}.0);
    if (hash(cell * 0.73) < uOpen) discard;
    vec2 t = (cell + 0.5) / ${FIELD_PIXELS}.0;
    float speed = 0.9 + uBoost * 3.5;
    float v = t.y - abs(t.x - uSize.x * 0.5) * 0.45 - uTime * speed;
    float chevron = step(0.6, fract(v * 0.8));
    float hue = fract(uHue + t.x * 0.035);
    vec3 col = mix(hsv(hue, 0.9, 0.28), hsv(hue, 0.55, 1.0), chevron * 0.85);
    float edge = max(step(t.y, 0.2), step(uSize.y - 0.2, t.y));
    col = mix(col, vec3(1.0), edge * 0.55);
    float twinkle = step(0.985, hash(cell + floor(uTime * 9.0)));
    col = mix(col, vec3(1.0), twinkle);
    col *= 1.0 + uBoost * 0.8;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Remolino del emblema central (el mismo lenguaje que los portales de las salas). */
const swirlShader = /* glsl */ `
  uniform float uTime;
  uniform float uSpin;
  uniform float uHue;
  varying vec2 vUv;
  vec3 hsv(float h, float s, float v) {
    vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return v * mix(vec3(1.0), k, s);
  }
  void main() {
    vec2 p = floor((vUv * 2.0 - 1.0) * 8.0 + 0.5) / 8.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float band = step(0.0, sin(a * 4.0 + r * 10.0 - uTime * uSpin));
    vec3 col = mix(hsv(uHue, 0.9, 1.0), hsv(fract(uHue + 0.5), 0.9, 0.7), band) * mix(1.3, 0.6, r);
    col = mix(col, vec3(1.0), step(r, 0.18));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

interface GateItem {
  gate: Gate;
  root: THREE.Group;
  /** Lo que se hunde en el suelo al abrirse (barandillas, pilares, emblema). */
  frame: THREE.Group;
  rings: THREE.Mesh[];
  /** Campo de la tapa y de la cara frontal. */
  fields: THREE.ShaderMaterial[];
  /** Tiempo desde que empezó a abrirse (-1 = cerrado). */
  opening: number;
}

/**
 * Muros portal en 3D: un campo de energía de lado a lado con flechas que suben,
 * enmarcado por dos barandillas oscuras con tira luminosa, pilares con remate
 * brillante en cada columna de pasillo y, a los lados del cartel central, dos
 * emblemas de portal (anillo octogonal y remolino). Todo recorre el arcoíris, como los portales,
 * para no confundirse con el color único del laberinto. Al abrirse, el campo se
 * disuelve píxel a píxel y el marco se hunde en el suelo a escalones.
 */
export class GatesView {
  readonly group = new THREE.Group();
  private items = new Map<number, GateItem>();
  private width = CONFIG.maze.width - 2;
  private height = CONFIG.gates.rows;
  private darkMaterial = new THREE.MeshLambertMaterial({ color: 0x1a1230 });
  private glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private swirl: THREE.ShaderMaterial;
  private topGeometry = new THREE.PlaneGeometry(this.width, this.height);
  private frontGeometry = new THREE.PlaneGeometry(this.width, FIELD_Z);
  private railGeometry = new THREE.BoxGeometry(this.width + 0.4, 0.34, RAIL_Z);
  private stripGeometry = new THREE.BoxGeometry(this.width + 0.4, 0.14, 0.06);
  private pillarGeometry = new THREE.BoxGeometry(0.62, this.height + 1.0, PILLAR_Z);
  private capGeometry = new THREE.BoxGeometry(0.74, 0.74, 0.18);
  private ringGeometry = new THREE.TorusGeometry(RING_RADIUS, 0.15, 4, 8);
  private discGeometry = new THREE.CircleGeometry(RING_RADIUS * 0.88, 24);
  private light = new THREE.PointLight(0xffffff, 0, 9, 1.3);
  private time = 0;
  private hue = 0;
  /** Muro por el que se está entrando (el campo se acelera y el emblema gira rápido). */
  absorbing: Gate | null = null;
  private unsubscribe: Array<() => void>;

  constructor(gates: Gates) {
    this.swirl = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSpin: { value: 4 }, uHue: { value: 0 } },
      vertexShader,
      fragmentShader: swirlShader,
    });
    this.group.add(this.light);
    this.unsubscribe = [
      gates.events.on('added', (g) => this.add(g)),
      gates.events.on('removed', (g) => this.remove(g.id)),
      gates.events.on('opened', (g) => {
        const item = this.items.get(g.id);
        if (item) item.opening = 0;
      }),
    ];
  }

  private add(gate: Gate): void {
    const root = new THREE.Group();
    root.position.set(0, gateCenterY(gate), 0);
    const top = new THREE.Mesh(this.topGeometry, this.fieldMaterial(this.height));
    top.position.z = FIELD_Z;
    // Cara frontal (la que mira al jugador que llega desde abajo), con el mismo campo.
    const front = new THREE.Mesh(this.frontGeometry, this.fieldMaterial(FIELD_Z));
    front.rotation.x = Math.PI / 2;
    front.position.set(0, -this.height / 2, FIELD_Z / 2);

    const frame = new THREE.Group();
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(this.railGeometry, this.darkMaterial);
      rail.position.set(0, side * (this.height / 2 + 0.1), RAIL_Z / 2);
      rail.castShadow = true;
      const strip = new THREE.Mesh(this.stripGeometry, this.glowMaterial);
      strip.position.set(0, side * (this.height / 2 + 0.1), RAIL_Z + 0.03);
      frame.add(rail, strip);
    }
    const center = (CONFIG.maze.width - 1) / 2;
    for (const col of CONFIG.maze.corridorColumns) {
      if (col === center) continue; // en el centro va el cartel con el nombre del minijuego
      const pillar = new THREE.Mesh(this.pillarGeometry, this.darkMaterial);
      pillar.position.set(worldX(col), 0, PILLAR_Z / 2);
      pillar.castShadow = true;
      const cap = new THREE.Mesh(this.capGeometry, this.glowMaterial);
      cap.position.set(worldX(col), 0, PILLAR_Z + 0.09);
      frame.add(pillar, cap);
    }
    const rings = [-1, 1].map((side) => {
      const ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
      ring.position.set(side * EMBLEM_X, 0, FIELD_Z + 0.12);
      const disc = new THREE.Mesh(this.discGeometry, this.swirl);
      disc.position.set(side * EMBLEM_X, 0, FIELD_Z + 0.04);
      frame.add(ring, disc);
      return ring;
    });

    root.add(top, front, frame);
    this.group.add(root);
    this.items.set(gate.id, { gate, root, frame, rings, fields: [top.material, front.material], opening: -1 });
  }

  private fieldMaterial(height: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: new THREE.Vector2(this.width, height) },
        uHue: { value: 0 },
        uOpen: { value: 0 },
        uBoost: { value: 0 },
      },
      vertexShader,
      fragmentShader: fieldShader,
      side: THREE.DoubleSide,
    });
  }

  private remove(id: number): void {
    const item = this.items.get(id);
    if (!item) return;
    this.group.remove(item.root);
    item.fields.forEach((m) => m.dispose());
    this.items.delete(id);
  }

  /** Tono actual del muro (0..1), para teñir efectos como los pedazos al abrirse. */
  get currentHue(): number {
    return this.hue;
  }

  update(dt: number, focusY: number): void {
    this.time += dt;
    const t = this.time;
    this.hue = (t * 0.3) % 1;
    this.glowMaterial.color.setHSL(this.hue, 1, 0.62);
    this.ringMaterial.color.setHSL((this.hue + 0.5) % 1, 1, 0.65);
    this.swirl.uniforms.uTime.value = t;
    this.swirl.uniforms.uHue.value = this.hue;
    this.swirl.uniforms.uSpin.value = this.absorbing ? 14 : 4;

    let nearest: GateItem | null = null;
    const { openTime } = CONFIG.gates;
    for (const item of this.items.values()) {
      const absorbing = this.absorbing === item.gate;
      const boost = item.fields[0].uniforms.uBoost.value as number;
      const nextBoost = boost + ((absorbing ? 1 : 0) - boost) * Math.min(1, dt * 8);
      let dissolve = 0;
      item.rings.forEach((ring, i) => {
        ring.rotation.z = t * (absorbing ? -7 : -1.3) * (i ? -1 : 1);
        ring.scale.setScalar(absorbing ? 1.15 : 1 + Math.sin(t * 3 + i) * 0.04);
      });

      if (item.opening >= 0) {
        item.opening += dt;
        const k = Math.min(1, item.opening / openTime);
        dissolve = Math.ceil(k * 8) / 8; // se disuelve a escalones
        item.frame.scale.z = Math.max(0.001, 1 - Math.ceil(k * 5) / 5); // el marco se hunde a escalones
        item.root.visible = k < 1;
      } else if (!nearest || Math.abs(item.gate.y0 - focusY) < Math.abs(nearest.gate.y0 - focusY)) {
        nearest = item;
      }
      for (const m of item.fields) {
        m.uniforms.uTime.value = t;
        m.uniforms.uHue.value = this.hue;
        m.uniforms.uBoost.value = nextBoost;
        m.uniforms.uOpen.value = dissolve;
      }
    }

    if (nearest) {
      this.light.position.set(0, nearest.root.position.y - 1, 2.6);
      this.light.color.setHSL(this.hue, 1, 0.6);
      this.light.intensity = 10 + Math.sin(t * 5) * 2;
    } else {
      this.light.intensity = 0;
    }
  }

  dispose(): void {
    this.unsubscribe.forEach((u) => u());
    [...this.items.keys()].forEach((id) => this.remove(id));
    [this.darkMaterial, this.glowMaterial, this.ringMaterial, this.swirl].forEach((m) => m.dispose());
    [this.topGeometry, this.frontGeometry, this.railGeometry, this.stripGeometry, this.pillarGeometry, this.capGeometry, this.ringGeometry, this.discGeometry].forEach((g) =>
      g.dispose(),
    );
    this.light.dispose();
  }
}
