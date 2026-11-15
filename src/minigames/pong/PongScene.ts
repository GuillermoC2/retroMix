import * as THREE from 'three';
import { NeonCycle } from '../../render/neon';
import { PixelCanvas, hexRGB } from '../../render/pixelTextures';
import { buildVoxelGeometry, spriteFromRows } from '../../render/voxel';
import { BALL_HALF, COURT_LINE, PADDLE_INSET, PADDLE_WIDTH, type PongGame, type PongSide } from './PongGame';
import type { PongTheme } from './themes';

const DEG = Math.PI / 180;
/** Barandillas de arriba y abajo: ancho hacia fuera, alto y cuánto sobresalen por cada lado. */
const RAIL_DEPTH = 7;
const RAIL_HEIGHT = 6;
const RAIL_OVERHANG = 10;
const POST_HEIGHT = RAIL_HEIGHT + 5;
const PADDLE_TALL = 8;
const BALL_SIZE = BALL_HALF * 2 + 0.6;
/** Altura del centro de la bola sobre el suelo (flota un poco para que se vea su sombra). */
const BALL_Z = BALL_SIZE / 2 + 1.4;
/** Inclinación de la cámara respecto a la vertical (mira la pista desde abajo, como el laberinto). */
const TILT = 30 * DEG;
const FOV = 20;
/** Hasta dónde llega el encuadre (en coordenadas normalizadas de pantalla) al ajustar la distancia. */
const FIT_MARGIN = 0.97;
const TRAIL = 6;
const MAX_PARTICLES = 260;
/** Cifras de 3×5 del marcador (fila 0 arriba). */
const DIGITS = [
  '111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111',
];
const DIGIT_VOXEL = 3;

/** Muelle amortiguado alrededor de 0. */
class Spring {
  value = 0;
  velocity = 0;
  constructor(
    private k: number,
    private c: number,
  ) {}
  update(dt: number): void {
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.velocity += (-this.k * this.value - this.c * this.velocity) * h;
      this.value += this.velocity * h;
    }
  }
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  gravity: number;
  color: THREE.Color;
}

interface Paddle {
  side: PongSide;
  mesh: THREE.Group;
  material: THREE.MeshLambertMaterial;
  squash: Spring;
  flash: number;
}

/**
 * Pong en 2.5D, con el mismo estilo que el laberinto: pista de vóxeles vista
 * en perspectiva desde abajo, barandillas de neón que cambian de color, palas
 * y bola con volumen y sombra, marcador de cubos sobre el suelo y partículas.
 * Se dibuja con su propio WebGLRenderer a baja resolución en el canvas de la
 * ventana (escalado sin suavizado). Solo lee el estado de `PongGame`.
 */
export class PongScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 4 / 3, 1, 2000);
  private neon: NeonCycle;
  private railMaterial: THREE.MeshLambertMaterial;
  private neonMaterials: THREE.MeshBasicMaterial[] = [];
  private glowMaterials: THREE.MeshBasicMaterial[] = [];
  private goalMaterials: Record<PongSide, THREE.MeshBasicMaterial>;
  private goalFlash: Record<PongSide, number> = { player: 0, ai: 0 };
  private paddles: Record<PongSide, Paddle>;
  private ball: THREE.Mesh;
  private ballLight: THREE.PointLight;
  private ballScale = new Spring(260, 12);
  private ballSpin = new THREE.Vector3();
  private trail: THREE.Mesh[] = [];
  private trailPoints: Array<{ x: number; y: number }> = [];
  private digitGeometries: THREE.BufferGeometry[];
  private digits: Record<PongSide, { mesh: THREE.Mesh; shown: number; pop: Spring }>;
  private ambient: THREE.AmbientLight;
  private particles: Particle[] = [];
  private particleMesh: THREE.InstancedMesh;
  private emberTimer = 0;
  private shakeAmount = 0;
  private zoom = new Spring(140, 9);
  private time = 0;
  private distance = 300;
  private lastPhase = '';
  private lastVy = 0;
  private readonly target = new THREE.Vector3(0, 0, 0);
  private readonly tmp = new THREE.Object3D();

  constructor(
    canvas: HTMLCanvasElement,
    private game: PongGame,
    private theme: PongTheme,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.setClearColor(theme.clear);
    this.scene.fog = new THREE.Fog(theme.clear, 380, 620);

    this.neon = new NeonCycle(theme.neon.colors, theme.neon.secondsPerColor, theme.neon.transition);
    this.railMaterial = new THREE.MeshLambertMaterial({ color: theme.railBody, emissive: 0xffffff, emissiveIntensity: 0.28 });

    this.ambient = new THREE.AmbientLight(theme.ambient, theme.ambientIntensity);
    const light = new THREE.DirectionalLight(0xfff2e0, 1.7);
    light.position.set(-70, -95, 230);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    Object.assign(light.shadow.camera, { left: -150, right: 150, top: 120, bottom: -120, near: 10, far: 600 });
    light.shadow.bias = -0.002;
    this.scene.add(this.ambient, light, light.target);

    this.buildFloor();
    this.buildRails();
    this.buildNet();
    this.goalMaterials = { player: this.buildGoal('player'), ai: this.buildGoal('ai') };
    this.paddles = { player: this.buildPaddle('player'), ai: this.buildPaddle('ai') };

    const ballMaterial = new THREE.MeshLambertMaterial({ color: theme.ball, emissive: theme.ball, emissiveIntensity: 0.75 });
    this.ball = new THREE.Mesh(new THREE.BoxGeometry(BALL_SIZE, BALL_SIZE, BALL_SIZE), ballMaterial);
    this.ball.castShadow = true;
    this.ballLight = new THREE.PointLight(theme.hard ? 0xffa040 : 0xffffff, 0, 46, 1.2);
    this.scene.add(this.ball, this.ballLight);
    for (let i = 0; i < TRAIL; i++) {
      const m = new THREE.Mesh(
        this.ball.geometry,
        new THREE.MeshBasicMaterial({ color: theme.hard ? 0xff6a1a : theme.ball, transparent: true, depthWrite: false }),
      );
      m.visible = false;
      this.trail.push(m);
      this.scene.add(m);
    }

    this.digitGeometries = DIGITS.map((bits) =>
      buildVoxelGeometry(
        spriteFromRows([0, 1, 2, 3, 4].map((r) => bits.slice(r * 3, r * 3 + 3)), { '1': 0xffffff }, () => 0),
        DIGIT_VOXEL,
      ),
    );
    this.digits = { player: this.buildDigit('player'), ai: this.buildDigit('ai') };

    this.particleMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), MAX_PARTICLES);
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);
  }

  /** Coordenadas del juego (Y hacia abajo) → mundo (Y hacia arriba, Z hacia la cámara). */
  private wx(x: number): number {
    return x - this.game.width / 2;
  }

  private wy(y: number): number {
    return this.game.height / 2 - y;
  }

  // ---------------------------------------------------------------------------
  // Construcción
  // ---------------------------------------------------------------------------

  private buildFloor(): void {
    const cell = 8;
    const tile = new PixelCanvas(cell, cell);
    const floor = hexRGB(this.theme.floor);
    const grid = hexRGB(this.theme.grid);
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) tile.set(x, y, x === 0 || y === 0 ? grid : floor);
    const tex = tile.toTexture(true);
    const w = 36 * cell;
    const h = 26 * cell;
    tex.repeat.set(w / cell, h / cell);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private buildRails(): void {
    const { width: W, height: H } = this.game;
    const length = W + RAIL_OVERHANG * 2;
    const inner = H / 2 - COURT_LINE;
    for (const sign of [1, -1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length, RAIL_DEPTH, RAIL_HEIGHT), this.railMaterial);
      rail.position.set(0, sign * (inner + RAIL_DEPTH / 2), RAIL_HEIGHT / 2);
      rail.castShadow = rail.receiveShadow = true;
      // Tubo de neón en el canto interior de arriba y resplandor en el suelo junto a la base.
      const tubeMaterial = new THREE.MeshBasicMaterial();
      this.neonMaterials.push(tubeMaterial);
      const tube = new THREE.Mesh(new THREE.BoxGeometry(length, 1.4, 1.4), tubeMaterial);
      tube.position.set(0, sign * (inner + 0.7), RAIL_HEIGHT + 0.2);
      const glowMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
      this.glowMaterials.push(glowMaterial);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(length, 6), glowMaterial);
      glow.position.set(0, sign * (inner - 3), 0.05);
      this.scene.add(rail, tube, glow);
      // Pilares en los extremos.
      for (const side of [1, -1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(6, RAIL_DEPTH + 2, POST_HEIGHT), this.railMaterial);
        post.position.set(side * (length / 2 - 3), sign * (inner + RAIL_DEPTH / 2), POST_HEIGHT / 2);
        post.castShadow = true;
        const capMaterial = new THREE.MeshBasicMaterial();
        this.neonMaterials.push(capMaterial);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(6.4, RAIL_DEPTH + 2.4, 1.4), capMaterial);
        cap.position.set(post.position.x, post.position.y, POST_HEIGHT + 0.2);
        this.scene.add(post, cap);
      }
    }
  }

  private buildNet(): void {
    const material = new THREE.MeshLambertMaterial({ color: this.theme.net, emissive: this.theme.net, emissiveIntensity: 0.45 });
    const geo = new THREE.BoxGeometry(1.6, 4, 1.6);
    for (let y = COURT_LINE + 2; y < this.game.height - COURT_LINE; y += 8) {
      const m = new THREE.Mesh(geo, material);
      m.position.set(0, this.wy(y + 2), 0.8);
      m.receiveShadow = true;
      this.scene.add(m);
    }
  }

  /** Franja luminosa en la línea de gol de cada lado (con el color de quien la defiende). */
  private buildGoal(side: PongSide): THREE.MeshBasicMaterial {
    const { width: W, height: H } = this.game;
    const material = new THREE.MeshBasicMaterial({
      color: side === 'player' ? this.theme.player : this.theme.ai,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, H - COURT_LINE * 2), material);
    mesh.position.set(side === 'player' ? -W / 2 + 1.5 : W / 2 - 1.5, 0, 0.06);
    this.scene.add(mesh);
    return material;
  }

  private buildPaddle(side: PongSide): Paddle {
    const color = side === 'player' ? this.theme.player : this.theme.ai;
    const material = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.22 });
    const h = this.game.cfg.paddleHeight;
    const body = new THREE.Mesh(new THREE.BoxGeometry(PADDLE_WIDTH + 1, h, PADDLE_TALL), material);
    body.position.z = PADDLE_TALL / 2;
    body.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(PADDLE_WIDTH + 1.4, h + 0.4, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    cap.position.z = PADDLE_TALL + 0.2;
    (cap.material as THREE.MeshBasicMaterial).color.setHex(color).lerp(new THREE.Color(0xffffff), 0.15);
    const mesh = new THREE.Group();
    mesh.add(body, cap);
    const x = side === 'player' ? PADDLE_INSET + PADDLE_WIDTH / 2 : this.game.width - PADDLE_INSET - PADDLE_WIDTH / 2;
    mesh.position.x = this.wx(x);
    this.scene.add(mesh);
    return { side, mesh, material, squash: new Spring(320, 11), flash: 0 };
  }

  private buildDigit(side: PongSide): { mesh: THREE.Mesh; shown: number; pop: Spring } {
    const color = side === 'player' ? this.theme.player : this.theme.ai;
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, color, emissive: color, emissiveIntensity: 0.3 });
    const mesh = new THREE.Mesh(this.digitGeometries[0], material);
    mesh.position.set(side === 'player' ? -20 : 20, this.wy(17), DIGIT_VOXEL / 2);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return { mesh, shown: 0, pop: new Spring(240, 9) };
  }

  // ---------------------------------------------------------------------------
  // Tamaño y cámara
  // ---------------------------------------------------------------------------

  /** Tamaño del framebuffer interno (píxeles "gordos"); el canvas se escala por CSS. */
  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.distance = this.fitDistance();
  }

  /** Distancia mínima a la que cabe toda la pista (con barandillas y pilares) en pantalla. */
  private fitDistance(): number {
    const { width: W, height: H } = this.game;
    const x = W / 2 + RAIL_OVERHANG;
    const y = H / 2 - COURT_LINE + RAIL_DEPTH;
    const corners: THREE.Vector3[] = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const z of [0, POST_HEIGHT]) corners.push(new THREE.Vector3(sx * x, sy * y, z));
    const p = new THREE.Vector3();
    let lo = 60;
    let hi = 1500;
    for (let i = 0; i < 24; i++) {
      const d = (lo + hi) / 2;
      this.placeCamera(d, 0, 0, 0);
      const fits = corners.every((c) => {
        p.copy(c).project(this.camera);
        return Math.abs(p.x) <= FIT_MARGIN && Math.abs(p.y) <= FIT_MARGIN;
      });
      if (fits) hi = d;
      else lo = d;
    }
    return hi;
  }

  private placeCamera(d: number, yaw: number, shakeX: number, shakeY: number): void {
    const t = this.target;
    this.camera.position.set(t.x + Math.sin(yaw) * d, t.y - Math.sin(TILT) * d, t.z + Math.cos(TILT) * d);
    this.camera.position.x += shakeX;
    this.camera.position.y += shakeY;
    this.camera.lookAt(t);
    this.camera.updateMatrixWorld();
  }

  // ---------------------------------------------------------------------------
  // Reacciones (las lanza PongMode al detectar el evento)
  // ---------------------------------------------------------------------------

  /** Golpe de pala: la pala se aplasta y brilla, chispas de su color. */
  hit(side: PongSide): void {
    const p = this.paddles[side];
    p.squash.velocity += 26;
    p.flash = 1;
    const b = this.game.ball;
    const color = new THREE.Color(side === 'player' ? this.theme.player : this.theme.ai);
    this.burst(this.wx(b.x), this.wy(b.y), BALL_Z, 12, color, 70, side === 'player' ? 1 : -1);
    this.shake(0.6);
  }

  /** Punto: la bola estalla junto a la portería, la franja de gol destella y la cámara tiembla. */
  point(by: PongSide): void {
    const b = this.game.ball;
    const x = this.wx(Math.max(0, Math.min(this.game.width, b.x)));
    const y = this.wy(b.y);
    const color = new THREE.Color(by === 'player' ? this.theme.player : this.theme.ai);
    this.burst(x, y, BALL_Z, 46, color, 120, 0);
    this.burst(x, y, BALL_Z, 18, new THREE.Color(this.theme.hard ? 0xff7a1a : 0xffffff), 90, 0);
    this.goalFlash[by === 'player' ? 'ai' : 'player'] = 1;
    this.shake(2.5);
    this.zoom.velocity -= 1.6;
  }

  private shake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  private burst(x: number, y: number, z: number, count: number, color: THREE.Color, speed: number, dirX: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.75);
      let vx = Math.cos(a) * s;
      if (dirX !== 0) vx = Math.abs(vx) * dirX;
      const c = color.clone().lerp(new THREE.Color(0xffffff), Math.random() * 0.4);
      this.spawn({ x, y, z, vx, vy: Math.sin(a) * s, vz: 30 + Math.random() * 70, life: 0.5 + Math.random() * 0.5, size: 1.2 + Math.random() * 1.6, gravity: 260, color: c });
    }
  }

  private spawn(p: Omit<Particle, 'max'>): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ ...p, max: p.life });
  }

  // ---------------------------------------------------------------------------
  // Fotograma
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    const { game, theme } = this;
    this.time += dt;
    this.neon.update(dt);
    const neon = this.neon.color;
    this.railMaterial.emissive.copy(neon);
    for (const m of this.neonMaterials) m.color.copy(neon);
    for (const m of this.glowMaterials) m.color.copy(neon);
    if (theme.flicker) {
      const f = Math.sin(this.time * 23) * 0.5 + Math.sin(this.time * 37 + 1) * 0.5;
      this.ambient.intensity = theme.ambientIntensity * (0.9 + f * 0.12);
    }

    // Saque: la bola aparece con un rebote de escala.
    if (game.phase !== this.lastPhase) {
      if (game.phase === 'play') {
        this.ballScale.value = -1;
        this.ballScale.velocity = 0;
        this.trailPoints.length = 0;
      }
      this.lastPhase = game.phase;
    }
    // Rebote en una barandilla: chispas pequeñas del color del neón.
    const b = game.ball;
    if (game.phase === 'play' && Math.sign(b.vy) !== Math.sign(this.lastVy) && this.lastVy !== 0 && Math.abs(b.y - game.height / 2) > game.height * 0.35) {
      this.burst(this.wx(b.x), this.wy(b.y), BALL_Z, 6, neon.clone(), 50, 0);
    }
    this.lastVy = b.vy;

    this.updatePaddles(dt);
    this.updateBall(dt);
    this.updateDigits(dt);
    this.updateGoals(dt);
    this.updateParticles(dt);

    // Cámara: balanceo muy suave, temblor y golpe de zoom en los puntos.
    this.zoom.update(dt);
    this.shakeAmount *= Math.exp(-dt * 10);
    const s = this.shakeAmount;
    const yaw = Math.sin(this.time * 0.6) * 0.4 * DEG;
    this.placeCamera(this.distance * (1 + this.zoom.value * 0.04), yaw, (Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s);
  }

  private updatePaddles(dt: number): void {
    const { game } = this;
    for (const p of [this.paddles.player, this.paddles.ai]) {
      p.squash.update(dt);
      p.flash = Math.max(0, p.flash - dt * 5);
      p.material.emissiveIntensity = 0.22 + p.flash * 1.1;
      const y = p.side === 'player' ? game.playerY : game.aiY;
      const sq = p.squash.value * 0.08;
      p.mesh.position.y = this.wy(y);
      p.mesh.scale.set(1 + sq * 1.6, 1 - sq * 0.25, 1 - sq * 0.5);
      // Al acabar, el ganador bota de alegría y el perdedor se hunde en el suelo.
      let z = 0;
      let tilt = 0;
      if (game.phase === 'over') {
        const t = game.phaseTime;
        if (game.winner === p.side) z = Math.abs(Math.sin(t * 9)) * 7;
        else {
          z = -(Math.min(1, t / 1.2) ** 2) * (PADDLE_TALL + 2);
          tilt = Math.min(1, t / 1.2) * 0.5 * (p.side === 'player' ? 1 : -1);
        }
      }
      p.mesh.position.z = z;
      p.mesh.rotation.y = tilt;
    }
  }

  private updateBall(dt: number): void {
    const { game } = this;
    const b = game.ball;
    const visible = game.phase === 'play';
    this.ball.visible = visible;
    this.ballLight.intensity = visible ? 60 : 0;
    if (visible) {
      this.ballScale.update(dt);
      const x = this.wx(b.x);
      const y = this.wy(b.y);
      this.ball.position.set(x, y, BALL_Z);
      this.ball.scale.setScalar(Math.max(0.05, 1 + this.ballScale.value));
      // Gira en el sentido de la marcha: más rápido cuanto más corre.
      const spin = (b.speed / 60) * dt * 3;
      this.ballSpin.x -= (b.vy / Math.max(1, b.speed)) * spin;
      this.ballSpin.y += (b.vx / Math.max(1, b.speed)) * spin;
      this.ball.rotation.set(this.ballSpin.x, this.ballSpin.y, 0);
      this.ballLight.position.set(x, y, BALL_Z + 4);
      this.trailPoints.push({ x, y });
      if (this.trailPoints.length > TRAIL + 1) this.trailPoints.shift();
      // Portal difícil: la bola va soltando brasas.
      if (this.theme.hard && Math.random() < dt * 40) {
        const c = new THREE.Color(Math.random() < 0.5 ? 0xffb02a : 0xff3a10);
        this.spawn({ x, y, z: BALL_Z, vx: -b.vx * 0.1, vy: -b.vy * 0.1, vz: 20 + Math.random() * 20, life: 0.35, size: 1 + Math.random(), gravity: -20, color: c });
      }
    }
    this.trail.forEach((m, i) => {
      const p = this.trailPoints[this.trailPoints.length - 2 - i];
      m.visible = visible && !!p;
      if (!p) return;
      const k = 1 - (i + 1) / (TRAIL + 1);
      m.position.set(p.x, p.y, BALL_Z);
      m.scale.setScalar(0.85 * k + 0.1);
      m.rotation.copy(this.ball.rotation);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.45 * k;
    });
  }

  private updateDigits(dt: number): void {
    for (const side of ['player', 'ai'] as const) {
      const d = this.digits[side];
      const score = Math.min(9, this.game.score[side]);
      if (score !== d.shown) {
        d.shown = score;
        d.mesh.geometry = this.digitGeometries[score];
        d.pop.velocity += 14;
      }
      d.pop.update(dt);
      const s = 1 + d.pop.value * 0.5;
      d.mesh.scale.set(s, s, 1 + d.pop.value * 2);
      d.mesh.position.z = (DIGIT_VOXEL / 2) * d.mesh.scale.z;
    }
  }

  private updateGoals(dt: number): void {
    for (const side of ['player', 'ai'] as const) {
      this.goalFlash[side] = Math.max(0, this.goalFlash[side] - dt * 1.6);
      const pulse = 0.25 + Math.sin(this.time * 4 + (side === 'ai' ? 1.5 : 0)) * 0.06;
      this.goalMaterials[side].opacity = pulse + this.goalFlash[side] * 0.75;
    }
  }

  private updateParticles(dt: number): void {
    const { game, theme } = this;
    // Brasas que suben del suelo en el portal difícil.
    if (theme.embers) {
      this.emberTimer += dt * 26;
      while (this.emberTimer >= 1) {
        this.emberTimer--;
        const hot = Math.random();
        const color = new THREE.Color(hot < 0.3 ? 0xffd040 : hot < 0.7 ? 0xff6a10 : 0xd01010);
        this.spawn({
          x: (Math.random() - 0.5) * (game.width + RAIL_OVERHANG * 2),
          y: (Math.random() - 0.5) * (game.height + RAIL_DEPTH * 2),
          z: 0.5,
          vx: (Math.random() - 0.5) * 8,
          vy: (Math.random() - 0.5) * 8 + 4,
          vz: 14 + Math.random() * 22,
          life: 1 + Math.random() * 1.4,
          size: 0.8 + Math.random() * 1.3,
          gravity: -6,
          color,
        });
      }
    }

    let n = 0;
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz -= p.gravity * dt;
      const half = p.size / 2;
      if (p.gravity > 0 && p.z < half) {
        p.z = half;
        p.vz = Math.abs(p.vz) * 0.4;
        p.vx *= 0.6;
        p.vy *= 0.6;
      }
      const k = p.life / p.max;
      this.tmp.position.set(p.x, p.y, p.z);
      this.tmp.rotation.set(p.life * 7, p.life * 5, 0);
      this.tmp.scale.setScalar(p.size * Math.min(1, k * 1.6));
      this.tmp.updateMatrix();
      this.particleMesh.setMatrixAt(n, this.tmp.matrix);
      this.particleMesh.setColorAt(n, p.color);
      n++;
      return true;
    });
    this.particleMesh.count = n;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Libera la GPU: cada minijuego crea su propio contexto WebGL y hay que devolverlo. */
  dispose(): void {
    const textures = new Set<THREE.Texture>();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of materials) {
        const map = (m as THREE.MeshLambertMaterial).map;
        if (map) textures.add(map);
        m.dispose();
      }
    });
    this.digitGeometries.forEach((g) => g.dispose());
    textures.forEach((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
