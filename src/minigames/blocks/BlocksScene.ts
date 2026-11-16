import * as THREE from 'three';
import { NeonCycle } from '../../render/neon';
import { PixelCanvas, hexRGB } from '../../render/pixelTextures';
import { SmokeEffect } from '../../render/SmokeEffect';
import { Spring, VoxelGlyphs, VoxelParticles, boxCorners, createMinigameRenderer, disposeScene, fitDistance } from '../scene3d';
import { BlocksGame, type Cell } from './BlocksGame';
import type { BlocksTheme } from './themes';

const DEG = Math.PI / 180;
/** Cámara algo a la derecha y por encima, como la vista por defecto del laberinto. */
const YAW = 14 * DEG;
const TILT = 7 * DEG;
const FOV = 30;
const BLOCK = 0.94;
const WALL_DEPTH = 1.25;
/** Ancho del panel de la derecha (siguiente pieza y líneas). */
const PANEL = 8;
const GLYPH_VOXEL = 0.32;
const MAX_PARTICLES = 700;

/** Textura de cada cubo: borde claro, cara media y bisel oscuro abajo a la derecha (escala de grises; el color lo pone cada bloque). */
function blockTexture(): THREE.DataTexture {
  const n = 8;
  const c = new PixelCanvas(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let v = 0xb4;
      if (x === 0 || y === 0) v = 0xff;
      else if (x === n - 1 || y === n - 1) v = 0x6a;
      else if (x === 1 && y === 1) v = 0xff;
      else if ((x === 2 && y === 1) || (x === 1 && y === 2)) v = 0xe0;
      c.set(x, y, [v, v, v]);
    }
  }
  return c.toTexture();
}

/**
 * Pozo de BLOQUES en 2.5D, con el estilo del laberinto: cubos de vóxeles con
 * bisel pixel art y sombra sobre el fondo, paredes con tubo de neón que cambia
 * de color, sombra de caída de la pieza, siguiente pieza flotando en un panel
 * y contador de líneas con cifras de vóxeles. Reacciones: las piezas se
 * aplastan al fijarse, la soltada de golpe deja estela y sacude, las líneas
 * completas parpadean y estallan en cubos y lo de encima cae con rebote.
 * Solo lee el estado de `BlocksGame`.
 */
export class BlocksScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1.2, 0.5, 400);
  private neon: NeonCycle;
  private wallMaterial: THREE.MeshLambertMaterial;
  private neonMaterials: THREE.MeshBasicMaterial[] = [];
  private colors: THREE.Color[];
  private board: THREE.InstancedMesh;
  private active: THREE.InstancedMesh;
  private ghost: THREE.InstancedMesh;
  private nextMesh: THREE.InstancedMesh;
  private nextGroup = new THREE.Group();
  private nextPop = new Spring(220, 10);
  private shownNext = -1;
  private glyphs = new VoxelGlyphs(GLYPH_VOXEL);
  private counter = new THREE.Group();
  private counterMaterial: THREE.MeshLambertMaterial;
  private counterPop = new Spring(220, 9);
  private shownCounter = '';
  private particles = new VoxelParticles(MAX_PARTICLES, 'y');
  /** Humo al soltar una pieza de golpe (girado para que suba por Y). */
  private smoke = new SmokeEffect();
  private ambient: THREE.AmbientLight;
  /** Golpe de cada casilla fijada (1 al fijarse, baja a 0): se aplasta y brilla. */
  private impact: Float32Array;
  /** Caída visual pendiente de cada fila tras borrar líneas (en casillas) y su velocidad. */
  private rowDrop: Float32Array;
  private rowSpeed: Float32Array;
  /** Posición visual de la pieza (persigue a la lógica) y su golpe de giro. */
  private shown = { x: 0, y: 0, type: 0 };
  private spin = new Spring(260, 14);
  private piecePop = new Spring(260, 12);
  private clearRows: number[] = [];
  private seen = { locks: 0, rotations: 0, clears: 0, phase: '' };
  private overTime = 0;
  private emberTimer = 0;
  private shakeAmount = 0;
  private time = 0;
  private distance = 40;
  private readonly target = new THREE.Vector3();
  private readonly tmp = new THREE.Object3D();
  private readonly tmpColor = new THREE.Color();
  private readonly white = new THREE.Color(0xffffff);
  /** Origen del pozo: centro de la casilla (0, 0) = (ox + 0.5, oy + 0.5). */
  private readonly ox: number;
  private readonly oy: number;
  private readonly panelX: number;

  constructor(
    canvas: HTMLCanvasElement,
    private game: BlocksGame,
    private theme: BlocksTheme,
  ) {
    const { width: W, height: H } = game;
    this.ox = -(W + 2 + PANEL) / 2 + 1;
    this.oy = -H / 2;
    this.panelX = this.ox + W + 1 + PANEL / 2;
    this.impact = new Float32Array(W * H);
    this.rowDrop = new Float32Array(H);
    this.rowSpeed = new Float32Array(H);
    this.colors = theme.pieces.map((c) => new THREE.Color(c));

    this.renderer = createMinigameRenderer(canvas, theme.clear);
    this.neon = new NeonCycle(theme.neon.colors, theme.neon.secondsPerColor, theme.neon.transition);
    this.wallMaterial = new THREE.MeshLambertMaterial({ color: theme.wallBody, emissive: 0xffffff, emissiveIntensity: 0.25 });

    this.ambient = new THREE.AmbientLight(theme.ambient, theme.ambientIntensity);
    const light = new THREE.DirectionalLight(0xfff2e0, 1.6);
    light.position.set(-8, 14, 24);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    Object.assign(light.shadow.camera, { left: -16, right: 16, top: 14, bottom: -14, near: 1, far: 80 });
    light.shadow.bias = -0.003;
    this.scene.add(this.ambient, light, light.target);

    this.buildWell();
    const tex = blockTexture();
    const blockGeo = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
    const blockMat = () => {
      const m = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.42 });
      // El brillo propio toma el color de cada bloque (instanceColor), como un neón.
      m.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\ntotalEmissiveRadiance *= vColor.rgb;\n#endif',
        );
      };
      m.customProgramCacheKey = () => 'block-emissive';
      return m;
    };
    this.board = new THREE.InstancedMesh(blockGeo, blockMat(), W * H);
    this.active = new THREE.InstancedMesh(blockGeo, blockMat(), 4);
    this.nextMesh = new THREE.InstancedMesh(blockGeo, blockMat(), 4);
    this.ghost = new THREE.InstancedMesh(blockGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22, depthWrite: false }), 4);
    for (const m of [this.board, this.active, this.nextMesh]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.count = 0;
    }
    this.ghost.frustumCulled = false;
    this.ghost.count = 0;
    // Instancias inicializadas para que exista `instanceColor`.
    for (const m of [this.board, this.active, this.nextMesh, this.ghost]) m.setColorAt(0, this.white);
    this.nextGroup.add(this.nextMesh);
    this.nextGroup.position.set(this.panelX, this.oy + H - 3.2, 0.6);
    this.smoke.group.rotation.x = -Math.PI / 2;
    this.scene.add(this.board, this.active, this.ghost, this.nextGroup, this.particles.mesh, this.smoke.group);

    this.counterMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, color: theme.hard ? 0xff5a2a : 0xffd51a, emissive: theme.hard ? 0xff3a10 : 0xffb000, emissiveIntensity: 0.35 });
    this.counter.position.set(this.panelX, this.oy + H - 9.2, 0.4);
    this.scene.add(this.counter);
  }

  // ---------------------------------------------------------------------------
  // Construcción
  // ---------------------------------------------------------------------------

  private buildWell(): void {
    const { width: W, height: H } = this.game;
    const { ox, oy } = this;
    // Fondo del pozo con rejilla pixelada (una celda por casilla).
    const cell = 8;
    const tile = new PixelCanvas(cell, cell);
    const back = hexRGB(this.theme.back);
    const grid = hexRGB(this.theme.grid);
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) tile.set(x, y, x === 0 || y === 0 ? grid : back);
    const tex = tile.toTexture(true);
    tex.repeat.set(W, H);
    const backMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: tex }));
    backMesh.position.set(ox + W / 2, oy + H / 2, 0);
    backMesh.receiveShadow = true;
    this.scene.add(backMesh);

    // Paredes (izquierda, derecha y suelo) con tubo de neón en el canto delantero interior.
    const wall = (x: number, y: number, w: number, h: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, WALL_DEPTH), this.wallMaterial);
      m.position.set(x + w / 2, y + h / 2, WALL_DEPTH / 2);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
    };
    wall(ox - 1, oy - 1, 1, H + 1.6);
    wall(ox + W, oy - 1, 1, H + 1.6);
    wall(ox, oy - 1, W, 1);
    const tube = (x: number, y: number, w: number, h: number) => {
      const mat = new THREE.MeshBasicMaterial();
      this.neonMaterials.push(mat);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.22), mat);
      m.position.set(x + w / 2, y + h / 2, WALL_DEPTH + 0.06);
      this.scene.add(m);
    };
    tube(ox - 0.22, oy - 0.22, 0.22, H + 0.82);
    tube(ox + W, oy - 0.22, 0.22, H + 0.82);
    tube(ox - 0.22, oy - 0.22, W + 0.44, 0.22);
    // Remates brillantes arriba de las paredes.
    for (const x of [ox - 1, ox + W]) tube(x, oy + H + 0.6, 1, 0.3);

    // Panel de la derecha: marco de la siguiente pieza.
    const px = this.panelX;
    const py = oy + H - 3.2;
    const frame = (x: number, y: number, w: number, h: number) => {
      const mat = new THREE.MeshBasicMaterial();
      this.neonMaterials.push(mat);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), mat);
      m.position.set(x, y, 0.15);
      this.scene.add(m);
    };
    const fw = 6;
    const fh = 4.6;
    frame(px, py + fh / 2, fw, 0.25);
    frame(px, py - fh / 2, fw, 0.25);
    frame(px - fw / 2, py, 0.25, fh);
    frame(px + fw / 2, py, 0.25, fh);
    const panelBack = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshLambertMaterial({ color: this.theme.back }));
    panelBack.position.set(px, py, 0.01);
    panelBack.receiveShadow = true;
    this.scene.add(panelBack);
  }

  // ---------------------------------------------------------------------------
  // Tamaño, cámara y posiciones en pantalla
  // ---------------------------------------------------------------------------

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const { width: W, height: H } = this.game;
    const corners = boxCorners(new THREE.Vector3(this.ox - 1, this.oy - 1, 0), new THREE.Vector3(this.ox + W + 1 + PANEL, this.oy + H + 1, WALL_DEPTH));
    this.distance = fitDistance(this.camera, corners, (d) => this.placeCamera(d, 0, 0), 0.96);
  }

  private placeCamera(d: number, shakeX: number, shakeY: number): void {
    const t = this.target;
    this.camera.position.set(t.x + Math.sin(YAW) * Math.cos(TILT) * d + shakeX, t.y + Math.sin(TILT) * d + shakeY, t.z + Math.cos(YAW) * Math.cos(TILT) * d);
    this.camera.lookAt(t);
    this.camera.updateMatrixWorld();
  }

  /** Posición en pantalla (0..1, origen arriba a la izquierda) de un punto del mundo. */
  private toScreen(x: number, y: number, z: number): { x: number; y: number } {
    const p = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
  }

  /** Puntos de pantalla para la interfaz: centro del pozo y encima del marco de la siguiente pieza y del contador. */
  anchors(): { well: { x: number; y: number }; next: { x: number; y: number }; lines: { x: number; y: number } } {
    const { width: W, height: H } = this.game;
    return {
      well: this.toScreen(this.ox + W / 2, this.oy + H / 2, WALL_DEPTH),
      next: this.toScreen(this.panelX, this.oy + H - 3.2 + 2.3 + 0.9, 0.3),
      lines: this.toScreen(this.panelX, this.oy + H - 9.2 + 1.9, 0.4),
    };
  }

  // ---------------------------------------------------------------------------
  // Fotograma
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    const { game, theme } = this;
    this.time += dt;
    this.neon.update(dt);
    this.wallMaterial.emissive.copy(this.neon.color);
    for (const m of this.neonMaterials) m.color.copy(this.neon.color);
    if (theme.flicker) {
      const f = Math.sin(this.time * 23) * 0.5 + Math.sin(this.time * 37 + 1) * 0.5;
      this.ambient.intensity = theme.ambientIntensity * (0.9 + f * 0.12);
    }

    this.detectEvents();
    for (let i = 0; i < this.impact.length; i++) this.impact[i] = Math.max(0, this.impact[i] - dt * 4);
    for (let y = 0; y < game.height; y++) {
      if (this.rowDrop[y] <= 0) continue;
      this.rowSpeed[y] += 70 * dt;
      this.rowDrop[y] -= this.rowSpeed[y] * dt;
      if (this.rowDrop[y] <= 0) {
        this.rowDrop[y] = 0;
        // Aterriza: golpe en toda la fila.
        for (let x = 0; x < game.width; x++) if (game.grid[y][x]) this.impact[y * game.width + x] = 0.6;
      }
    }
    if (game.phase === 'over') this.overTime += dt;

    this.drawBoard();
    this.drawPiece(dt);
    this.drawNext(dt);
    this.drawCounter(dt);
    this.updateParticles(dt);
    this.smoke.update(dt);

    this.shakeAmount *= Math.exp(-dt * 12);
    const s = this.shakeAmount;
    this.target.set(Math.sin(this.time * 0.5) * 0.08, 0, 0);
    this.placeCamera(this.distance, (Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s);
  }

  private shake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  private cellPos(x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3(this.ox + x + 0.5, this.oy + y + 0.5, 0.5);
  }

  /** Reacciones a lo que ha pasado en la lógica desde el último fotograma. */
  private detectEvents(): void {
    const { game, seen } = this;
    if (game.locks !== seen.locks) {
      seen.locks = game.locks;
      const lock = game.lastLock!;
      const color = this.colors[lock.type - 1];
      for (const c of lock.cells) if (c.y < game.height) this.impact[c.y * game.width + c.x] = 1;
      if (lock.hard) {
        // Estela por cada columna de la pieza y polvo al chocar.
        for (const c of lock.cells) {
          for (let k = 1; k <= lock.dropped; k += 0.5) {
            const p = this.cellPos(c.x, c.y + k);
            this.particles.spawn({ x: p.x + (Math.random() - 0.5) * 0.6, y: p.y, z: 0.5, vx: 0, vy: 3 + Math.random() * 3, vz: 0, life: 0.15 + Math.random() * 0.2, size: 0.35, gravity: 0, color: color.clone().lerp(this.white, 0.4) });
          }
        }
        this.dropSmoke(lock.cells, lock.dropped);
        this.shake(0.3 + Math.min(1, lock.dropped / 12) * 0.35);
      }
      const bottom = Math.min(...lock.cells.map((c) => c.y));
      for (const c of lock.cells) {
        if (c.y !== bottom) continue;
        const p = this.cellPos(c.x, c.y - 0.5);
        this.particles.burst(p.x, p.y, 0.9, lock.hard ? 4 : 2, color, 4, { lift: 4, gravity: 18, size: 0.22 });
      }
    }
    if (game.rotations !== seen.rotations) {
      seen.rotations = game.rotations;
      this.spin.velocity += 9;
      this.piecePop.velocity += 3;
    }
    if (game.clears !== seen.clears) {
      seen.clears = game.clears;
      this.clearRows = [...game.clearing];
    }
    if (seen.phase === 'clear' && game.phase !== 'clear') this.finishClear();
    seen.phase = game.phase;
  }

  /** Las líneas completas estallan en cubos y lo de encima cae con rebote. */
  private finishClear(): void {
    const { game } = this;
    const rows = this.clearRows;
    for (const y of rows) {
      for (let x = 0; x < game.width; x++) {
        const p = this.cellPos(x, y);
        const c = this.tmpColor.setHSL(Math.random(), 0, 1);
        this.particles.burst(p.x, p.y, 0.6, 3, this.theme.hard ? new THREE.Color(Math.random() < 0.5 ? 0xffb020 : 0xff4a10) : c.clone(), 7, { lift: 6, gravity: 22, size: 0.28 });
        this.particles.spawn({ x: p.x, y: p.y, z: 0.6, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 6, vz: 6 + Math.random() * 10, life: 0.7, size: 0.6, gravity: 22, color: this.white.clone() });
      }
    }
    // Cada fila que queda cae tantas casillas como líneas borradas tenía debajo.
    for (let y = 0; y < game.height; y++) {
      let below = 0;
      let old = y;
      for (const r of [...rows].sort((a, b) => a - b)) if (r <= old) {
        below++;
        old++;
      }
      this.rowDrop[y] = below;
      this.rowSpeed[y] = 0;
    }
    this.shake(0.15 + rows.length * 0.12);
    this.clearRows = [];
  }

  private drawBoard(): void {
    const { game, board, tmp } = this;
    const { width: W, height: H } = game;
    const blinking = game.phase === 'clear';
    const blinkOn = Math.floor(game.phaseTime / 0.06) % 2 === 0;
    let n = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = game.grid[y][x];
        if (!t) continue;
        const i = y * W + x;
        const imp = this.impact[i];
        const p = this.cellPos(x, y + this.rowDrop[y]);
        let scale = 1;
        const color = this.tmpColor.copy(this.colors[t - 1]);
        if (blinking && this.clearRows.includes(y)) {
          // Línea completa: parpadea en blanco y se hincha.
          if (blinkOn) color.copy(this.white);
          scale = 1 + Math.min(1, game.phaseTime / game.cfg.clearTime) * 0.18;
        }
        if (game.phase === 'over') this.overColor(color, y);
        color.lerp(this.white, imp * 0.55);
        tmp.position.set(p.x, p.y - imp * 0.08, p.z + imp * 0.12);
        tmp.rotation.set(0, 0, 0);
        tmp.scale.set(scale * (1 + imp * 0.08), scale * (1 - imp * 0.22), scale * (1 + imp * 0.25));
        tmp.updateMatrix();
        board.setMatrixAt(n, tmp.matrix);
        board.setColorAt(n, color);
        n++;
      }
    }
    board.count = n;
    board.instanceMatrix.needsUpdate = true;
    if (board.instanceColor) board.instanceColor.needsUpdate = true;
  }

  /** Al acabar: si se pierde, el pozo se apaga de arriba abajo; si se gana, lo recorre una ola de luz. */
  private overColor(color: THREE.Color, y: number): void {
    const H = this.game.height;
    if (this.game.won) {
      const wave = this.overTime * 22 - y;
      if (wave > 0 && wave < 3) color.lerp(this.white, 1 - wave / 3);
    } else {
      const k = Math.min(1, Math.max(0, this.overTime * 14 - (H - 1 - y)));
      color.lerp(this.tmpColor2.set(this.theme.hard ? 0x3a0a0a : 0x2a2c48), k * 0.85);
    }
  }
  private readonly tmpColor2 = new THREE.Color();

  private drawPiece(dt: number): void {
    const { game, active, ghost, tmp } = this;
    const piece = game.phase === 'play' ? game.piece : null;
    if (!piece) {
      active.count = 0;
      ghost.count = 0;
      return;
    }
    // Pieza nueva: aparece de golpe en su sitio con un rebote.
    if (piece.type !== this.shown.type || game.locks !== this.lastPieceLocks) {
      this.lastPieceLocks = game.locks;
      this.shown = { x: piece.x, y: piece.y, type: piece.type };
      this.piecePop.value = -0.6;
      this.piecePop.velocity = 0;
    }
    const k = 1 - Math.exp(-dt * 32);
    this.shown.x += (piece.x - this.shown.x) * k;
    this.shown.y += (piece.y - this.shown.y) * k;
    this.spin.update(dt);
    this.piecePop.update(dt);
    const color = this.colors[piece.type - 1];
    const glow = this.tmpColor.copy(color).lerp(this.white, 0.04 + Math.max(0, Math.sin(this.time * 8)) * 0.06);
    const pop = 1 + this.piecePop.value * 0.25;
    // Centro de la caja de la pieza (para que el rebote de giro sea alrededor de ella).
    const cx = (piece.size - 1) / 2;
    const cy = (piece.size - 1) / 2;
    piece.cells.forEach((c, i) => {
      const dx = (c.x - cx) * pop;
      const dy = (c.y - cy) * pop;
      const a = this.spin.value * 0.04;
      const p = this.cellPos(this.shown.x + cx + dx * Math.cos(a) - dy * Math.sin(a), this.shown.y + cy + dx * Math.sin(a) + dy * Math.cos(a));
      tmp.position.set(p.x, p.y, p.z + 0.06);
      tmp.rotation.set(0, 0, a);
      tmp.scale.setScalar(Math.max(0.2, pop));
      tmp.updateMatrix();
      active.setMatrixAt(i, tmp.matrix);
      active.setColorAt(i, glow);
    });
    active.count = 4;
    active.instanceMatrix.needsUpdate = true;
    if (active.instanceColor) active.instanceColor.needsUpdate = true;

    // Sombra: dónde caería.
    const gy = game.dropY();
    piece.cells.forEach((c, i) => {
      const p = this.cellPos(piece.x + c.x, gy + c.y);
      tmp.position.copy(p);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.setScalar(0.9);
      tmp.updateMatrix();
      ghost.setMatrixAt(i, tmp.matrix);
      ghost.setColorAt(i, color);
    });
    ghost.count = gy === piece.y ? 0 : 4;
    ghost.instanceMatrix.needsUpdate = true;
    if (ghost.instanceColor) ghost.instanceColor.needsUpdate = true;
  }
  private lastPieceLocks = -1;

  private drawNext(dt: number): void {
    const { game, nextMesh, tmp } = this;
    if (game.next !== this.shownNext) {
      this.shownNext = game.next;
      this.nextPop.value = -0.8;
      this.nextPop.velocity = 0;
      const { cells, size } = BlocksGame.shape(game.next);
      const minX = Math.min(...cells.map((c) => c.x));
      const maxX = Math.max(...cells.map((c) => c.x));
      const minY = Math.min(...cells.map((c) => c.y));
      const maxY = Math.max(...cells.map((c) => c.y));
      void size;
      cells.forEach((c: Cell, i) => {
        tmp.position.set(c.x - (minX + maxX) / 2, c.y - (minY + maxY) / 2, 0);
        tmp.rotation.set(0, 0, 0);
        tmp.scale.setScalar(1);
        tmp.updateMatrix();
        nextMesh.setMatrixAt(i, tmp.matrix);
        nextMesh.setColorAt(i, this.colors[game.next - 1]);
      });
      nextMesh.count = 4;
      nextMesh.instanceMatrix.needsUpdate = true;
      if (nextMesh.instanceColor) nextMesh.instanceColor.needsUpdate = true;
    }
    this.nextPop.update(dt);
    const s = 0.8 * (1 + this.nextPop.value * 0.5);
    this.nextGroup.scale.setScalar(Math.max(0.05, s));
    this.nextGroup.rotation.set(Math.sin(this.time * 1.3) * 0.25, Math.sin(this.time * 0.9) * 0.45, Math.sin(this.time * 1.1) * 0.06);
    this.nextGroup.position.z = 0.9 + Math.sin(this.time * 2) * 0.15;
  }

  private drawCounter(dt: number): void {
    const { game } = this;
    const text = `${Math.min(game.lines, game.linesToWin)}/${game.linesToWin}`;
    if (text !== this.shownCounter) {
      if (this.shownCounter) this.counterPop.velocity += 14;
      this.shownCounter = text;
      this.counter.clear();
      const adv = this.glyphs.advance;
      const start = (-(text.length - 1) * adv) / 2;
      [...text].forEach((ch, i) => {
        const m = new THREE.Mesh(this.glyphs.get(ch), this.counterMaterial);
        m.position.x = start + i * adv;
        m.castShadow = true;
        this.counter.add(m);
      });
    }
    this.counterPop.update(dt);
    const s = 1 + this.counterPop.value * 0.35;
    this.counter.scale.set(s, s, 1 + this.counterPop.value * 2);
    this.counter.rotation.z = Math.sin(this.time * 1.4) * 0.04;
  }

  /**
   * Humo al chocar una pieza soltada de golpe: una bocanada bajo cada casilla
   * de apoyo y un anillo que se abre a los lados; más humo cuanto más ha caído.
   * El grupo del humo está girado: (x, y, z) del pozo → (x, −z, y) del humo.
   */
  private dropSmoke(cells: { x: number; y: number }[], dropped: number): void {
    const bottom = Math.min(...cells.map((c) => c.y));
    const base = cells.filter((c) => c.y === bottom);
    const fall = Math.min(1, dropped / 12);
    const xs = base.map((c) => this.cellPos(c.x, c.y).x);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const y = this.cellPos(0, bottom).y - 0.45;
    const half = (Math.max(...xs) - Math.min(...xs)) / 2 + 0.5;
    // Algo por delante del pozo (z = 1,1) para que el fondo no tape la mitad del anillo.
    this.smoke.ring(cx, -1.1, y, half, 10 + Math.round(fall * 10), 0.9 + fall * 0.6);
    for (const x of xs) this.smoke.ring(x, -1.1, y, 0.35, 3, 0.7 + fall * 0.4);
  }

  private updateParticles(dt: number): void {
    const { game, theme } = this;
    if (theme.embers) {
      this.emberTimer += dt * 14;
      while (this.emberTimer >= 1) {
        this.emberTimer--;
        const hot = Math.random();
        this.particles.spawn({
          x: this.ox + Math.random() * game.width,
          y: this.oy - 0.5,
          z: 0.4 + Math.random() * 0.9,
          vx: (Math.random() - 0.5) * 0.6,
          vy: 1.5 + Math.random() * 2.5,
          vz: (Math.random() - 0.5) * 0.3,
          life: 1.6 + Math.random() * 2,
          size: 0.1 + Math.random() * 0.14,
          gravity: -0.4,
          color: new THREE.Color(hot < 0.3 ? 0xffd040 : hot < 0.7 ? 0xff6a10 : 0xd01010),
        });
      }
    }
    this.particles.update(dt);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    disposeScene(this.scene, this.renderer);
    this.glyphs.dispose();
    this.smoke.dispose();
  }
}
