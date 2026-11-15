import * as THREE from 'three';
import { CONFIG, type SpecialPowerId } from '../../config';
import type { Player } from '../entities/Player';
import { PlayerView, type HeroPose } from '../entities/PlayerView';
import { HERO_DIAMETER, cherryGeometry, type HeroLook } from '../entities/sprites';
import { TENTACLE_COUNT, type TentacleView } from './TentacleView';
import { rand, type ElementParticles } from './ElementParticles';

type Stage = 'idle' | 'rise' | 'act' | 'fall' | 'settle';

/** Lo que devuelve el acto de un poder en cada fotograma. */
interface ActFrame {
  /** Escala del protagonista en el mundo. */
  scale: number;
  /** Tamaño aparente: fracción de la altura de pantalla que ocupa. */
  size: number;
  /** Apertura de la boca (0–1). */
  mouth: number;
  look: HeroLook;
  /** (FUEGO HIELO) avance del hielo y del fuego por el cuerpo (0–1; por defecto 1). */
  spread?: number;
}

type DecorStage = 'act' | 'fall';

/** Parte central de la cinemática, propia de cada poder. */
interface PowerAct {
  readonly duration: number;
  /** Escala con la que cae y aterriza. */
  readonly finalScale: number;
  /** Altura extra con la que aterriza (el GHOUL queda por encima de los muros). */
  readonly finalLift: number;
  /** Aspecto con el que cae y aterriza. */
  readonly finalLook: HeroLook;
  update(t: number, stage: ActStage): ActFrame;
  /**
   * Elementos que acompañan al protagonista durante el acto y la caída (p. ej.
   * los tentáculos), colocados según su pose. Devuelve si ha dibujado algo.
   */
  decorate?(stage: DecorStage, t: number, pose: HeroPose, s: ActStage): boolean;
  end(): void;
}

/** Lo que la cinemática ofrece a los actos: cámara, punto de primer plano y efectos. */
interface ActStage {
  /** Ejes de la cámara (derecha, arriba, adelante) y su orientación. */
  right: THREE.Vector3;
  up: THREE.Vector3;
  forward: THREE.Vector3;
  cameraQuat: THREE.Quaternion;
  /** Punto ante la cámara donde la figura de `scale` ocupa `size` de la pantalla. */
  closeUp(scale: number, size: number, out: THREE.Vector3): THREE.Vector3;
  /** Medio ancho visible (casillas) a la distancia del primer plano indicado. */
  halfWidthAt(scale: number, size: number): number;
  shake(amount: number): void;
  props: THREE.Group;
  tentacles: TentacleView;
  /** Partículas de fuego y hielo (FUEGO HIELO). */
  particles: ElementParticles;
}

const DEG = Math.PI / 180;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const newPose = (): HeroPose => ({
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  scale: new THREE.Vector3(),
  mouth: 0.5,
  look: 'normal',
});
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

/** Rebote de "pop": se pasa del objetivo y se asienta. */
const pop = (tau: number, amount: number) => 1 + amount * Math.exp(-tau * 9) * Math.cos(tau * 26);

/**
 * GIGANTE: una cereza entra volando desde la derecha, se la come (mordiscos
 * rápidos) y crece en escalones, cada uno con un "pop" y una sacudida.
 */
class GiantAct implements PowerAct {
  private cfg = CONFIG.specialPowers.giant;
  private intro = this.cfg.intro;
  readonly duration = this.intro.cherryTime + this.intro.chompTime + this.intro.growSteps * this.intro.stepEvery + this.intro.hold;
  readonly finalScale = this.cfg.scale;
  readonly finalLift = 0;
  readonly finalLook = 'normal';
  private cherry: THREE.Mesh;
  private stepsDone = 0;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private spin = new THREE.Quaternion();

  constructor(private props: THREE.Group) {
    this.cherry = new THREE.Mesh(cherryGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x401010 }));
    this.cherry.scale.setScalar(0.75);
    props.add(this.cherry);
  }

  update(t: number, s: ActStage): ActFrame {
    const { cherryTime, chompTime, growSteps, stepEvery, closeUpEndSize } = this.intro;
    const startSize = CONFIG.specialPowers.cinematic.closeUpSize;

    // 1. La cereza llega en arco hasta la boca (a la derecha del centro).
    if (t < cherryTime) {
      const k = t / cherryTime;
      s.closeUp(1, startSize, this.from).addScaledVector(s.forward, -0.15);
      this.to.copy(this.from).addScaledVector(s.right, HERO_DIAMETER * 0.45);
      this.from.addScaledVector(s.right, s.halfWidthAt(1, startSize) * 1.15).addScaledVector(s.up, 0.4);
      this.cherry.position.lerpVectors(this.from, this.to, easeInOut(k)).addScaledVector(s.up, Math.sin(k * Math.PI) * 0.35);
      this.cherry.quaternion.copy(s.cameraQuat).multiply(this.spin.setFromAxisAngle(Z_AXIS, -k * Math.PI * 3));
      this.cherry.visible = true;
      return { scale: 1, size: startSize, mouth: 0.5 + 0.5 * k, look: 'normal' };
    }
    this.cherry.visible = false;

    // 2. Mordiscos.
    const tc = t - cherryTime;
    if (tc < chompTime) {
      return { scale: 1, size: startSize * pop(tc, 0.08), mouth: Math.abs(Math.cos((tc / chompTime) * Math.PI * 3)), look: 'normal' };
    }

    // 3. Crece en escalones.
    const tg = tc - chompTime;
    const step = Math.min(growSteps, Math.floor(tg / stepEvery) + 1);
    if (step > this.stepsDone) {
      this.stepsDone = step;
      s.shake(0.12 + 0.06 * step);
    }
    const f = step / growSteps;
    const tau = tg - (step - 1) * stepEvery;
    return {
      scale: 1 + (this.finalScale - 1) * f,
      size: (startSize + (closeUpEndSize - startSize) * f) * pop(tau, 0.2),
      mouth: tau < 0.12 ? 0.9 : 0.15,
      look: 'normal',
    };
  }

  end(): void {
    this.props.remove(this.cherry);
    (this.cherry.material as THREE.Material).dispose();
  }
}

/**
 * GHOUL: se oscurece parpadeando entre su color y el gris (y se le enciende el ojo
 * rojo), crece de golpe y le brotan cuatro tentáculos de vóxeles de la espalda,
 * uno tras otro con sacudida. Los tentáculos se agitan y le acompañan en la caída.
 */
class GhoulAct implements PowerAct {
  private cfg = CONFIG.specialPowers.ghoul;
  private intro = this.cfg.intro;
  private tentaclesAt = this.intro.darkenTime + this.intro.growTime + 0.1;
  readonly duration = this.tentaclesAt + TENTACLE_COUNT * this.intro.tentacleEvery + this.intro.hold;
  readonly finalScale = this.cfg.scale;
  readonly finalLift = this.cfg.lift;
  readonly finalLook = 'ghoul';
  private shaken = new Set<string>();
  private clock = 0;
  private lastT = 0;
  private points = Array.from({ length: 5 }, () => new THREE.Vector3());
  private curve = new THREE.CatmullRomCurve3(this.points, false, 'centripetal');
  private dir = new THREE.Vector3();

  private once(key: string, s: ActStage, amount: number): void {
    if (this.shaken.has(key)) return;
    this.shaken.add(key);
    s.shake(amount);
  }

  update(t: number, s: ActStage): ActFrame {
    const { darkenTime, growTime, closeUpEndSize, tentacleEvery } = this.intro;
    const startSize = CONFIG.specialPowers.cinematic.closeUpSize;

    // 1. Se oscurece: parpadea entre su color y el gris, cada vez más tiempo en gris.
    if (t < darkenTime) {
      const k = t / darkenTime;
      const flick = Math.floor(t * 22) % 4;
      const dark = flick < Math.round(k * 4);
      if (k > 0.5) this.once('darken', s, 0.1);
      return { scale: 1, size: startSize, mouth: 0.9, look: dark ? 'ghoul' : 'normal' };
    }

    // 2. Crece de golpe hasta su tamaño de GHOUL.
    const tg = t - darkenTime;
    if (tg < growTime) {
      this.once('grow', s, 0.3);
      const k = tg / growTime;
      const e = 1 - (1 - k) ** 3;
      return {
        scale: 1 + (this.cfg.scale - 1) * e,
        size: startSize + (closeUpEndSize - startSize) * e,
        mouth: 1,
        look: 'ghoul',
      };
    }

    // 3. Le brotan los tentáculos (cada uno con su sacudida); ruge y luego cierra la boca.
    for (let i = 0; i < TENTACLE_COUNT; i++) {
      if (t >= this.tentaclesAt + i * tentacleEvery) this.once(`t${i}`, s, 0.14);
    }
    const tau = tg - growTime;
    const allOut = t >= this.tentaclesAt + TENTACLE_COUNT * tentacleEvery;
    return {
      scale: this.cfg.scale,
      size: closeUpEndSize * pop(tau, 0.15),
      mouth: allOut ? 0.25 : 0.9,
      look: 'ghoul',
    };
  }

  decorate(stage: DecorStage, t: number, pose: HeroPose, s: ActStage): boolean {
    const { tentacleEvery, tentacleGrow } = this.intro;
    this.clock += stage === 'act' ? Math.max(0, t - this.lastT) : 1 / 60;
    this.lastT = t;
    const scale = Math.abs(pose.scale.y);
    const [r0, r1] = this.cfg.thickness;
    const k0 = scale / this.cfg.scale;
    // En estrella, uno a cada lado del cuerpo (en diagonal), detrás de él.
    const base = [45, 135, 225, 315];
    const writhe = this.cfg.writhe;
    let drawn = false;
    for (let i = 0; i < TENTACLE_COUNT; i++) {
      const k = stage === 'act' ? (t - this.tentaclesAt - i * tentacleEvery) / tentacleGrow : 1;
      if (k <= 0) continue;
      // Brota pasándose un poco de largo y vuelve.
      const grow = k >= 1 ? 1 : Math.min(1.2, k * 1.2);
      const len = 1.45 * scale * grow;
      // Detrás del cuerpo (más lejos de la cámara) para que el cuerpo quede delante.
      const behind = r0 * k0 + 0.2;
      this.points.forEach((pt, n) => {
        const u = n / (this.points.length - 1);
        // Se curvan y se retuercen con ondas de varias frecuencias (algo caótico).
        const chaos = Math.sin(this.clock * (3 + i * 0.6) + i * 1.7 + u * 3) * 0.6 + Math.sin(this.clock * (7.7 - i) + u * 5.1) * 0.4;
        const a = (base[i] + u * 30 * (i % 2 ? 1 : -1)) * DEG + chaos * writhe * 1.3 * u;
        const r = 0.3 * scale + u * len;
        this.dir.copy(s.right).multiplyScalar(Math.cos(a)).addScaledVector(s.up, Math.sin(a));
        pt.copy(pose.position).addScaledVector(this.dir, r).addScaledVector(s.forward, behind + 0.05 * scale * u);
      });
      this.curve.updateArcLengths();
      s.tentacles.set(i, this.curve, r0 * k0, r1 * k0, 1);
      drawn = true;
    }
    return drawn;
  }

  end(): void {}
}

/**
 * FUEGO HIELO: de cara a la cámara, su lado izquierdo se congela y el derecho
 * empieza a arder a la vez, avanzando en escalones hasta encontrarse en el centro
 * (escarcha que cuaja por un lado y llamas que suben por el otro). Luego crece un
 * poco de golpe con una explosión de fuego y hielo, y ruge.
 */
class FireIceAct implements PowerAct {
  private cfg = CONFIG.specialPowers.fireIce;
  private intro = this.cfg.intro;
  readonly duration = this.intro.spreadTime + this.intro.growTime + this.intro.hold;
  readonly finalScale = this.cfg.scale;
  readonly finalLift = 0;
  readonly finalLook = 'fireice';
  private steps = 0;
  private spread = 0;
  /** Explosión de fuego y hielo al crecer: pendiente / hecha. */
  private burst: 'no' | 'pending' | 'done' = 'no';
  private lastT = 0;
  private lastStage: DecorStage = 'act';
  private center = new THREE.Vector3();
  private point = new THREE.Vector3();
  private v = new THREE.Vector3();

  update(t: number, s: ActStage): ActFrame {
    const { spreadTime, growTime, closeUpEndSize } = this.intro;
    const startSize = CONFIG.specialPowers.cinematic.closeUpSize;

    // 1. Hielo por la izquierda y fuego por la derecha, en escalones (cada uno con un crujido).
    if (t < spreadTime) {
      const steps = 6;
      const step = Math.min(steps, Math.floor((t / spreadTime) * (steps + 1)));
      if (step > this.steps) {
        this.steps = step;
        s.shake(0.05 + 0.015 * step);
      }
      this.spread = step / steps;
      return { scale: 1, size: startSize, mouth: 0.15, look: 'fireice', spread: this.spread };
    }
    this.spread = 1;

    // 2. Crece un poco de golpe, con una explosión de fuego y hielo.
    const tg = t - spreadTime;
    if (this.burst === 'no') {
      this.burst = 'pending';
      s.shake(0.3);
    }
    if (tg < growTime) {
      const e = 1 - (1 - tg / growTime) ** 3;
      return {
        scale: 1 + (this.cfg.scale - 1) * e,
        size: startSize + (closeUpEndSize - startSize) * e,
        mouth: 0.6,
        look: 'fireice',
      };
    }

    // 3. Ruge y espera.
    const tau = tg - growTime;
    return { scale: this.cfg.scale, size: closeUpEndSize * pop(tau, 0.15), mouth: tau < 0.3 ? 1 : 0.3, look: 'fireice' };
  }

  decorate(stage: DecorStage, t: number, pose: HeroPose, s: ActStage): boolean {
    const dt = stage === this.lastStage ? Math.max(0, t - this.lastT) : 1 / 60;
    this.lastT = t;
    this.lastStage = stage;
    const scale = Math.abs(pose.scale.y);
    const r = (HERO_DIAMETER / 2) * scale;
    // Un poco por delante del cuerpo, para que no lo tape.
    this.center.copy(pose.position).addScaledVector(s.forward, -0.12 * scale);
    const k = stage === 'fall' ? 1 : this.spread;
    if (k <= 0) return false;
    const rate = (stage === 'fall' ? 50 : 90) * dt;
    const count = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      // Llamas por el borde derecho (hasta donde ha llegado el fuego), que suben.
      const af = rand(-Math.PI / 2, Math.PI / 2) * k;
      this.at(s, Math.cos(af) * r, Math.sin(af) * r);
      this.v.copy(s.up).multiplyScalar(rand(1.2, 2.4) * scale).addScaledVector(s.right, rand(0, 0.8) * scale);
      s.particles.emit('fire', this.point.x, this.point.y, this.point.z, this.v.x, this.v.y, this.v.z, rand(0.06, 0.11) * scale, rand(0.3, 0.5), { grow: 0.8 });
      // Escarcha por el borde izquierdo, que cuaja y cae despacio.
      const ai = Math.PI + rand(-Math.PI / 2, Math.PI / 2) * k;
      const ri = r * rand(0.95, 1.1);
      this.at(s, Math.cos(ai) * ri, Math.sin(ai) * ri);
      this.v.copy(s.right).multiplyScalar(-rand(0.1, 0.5) * scale).addScaledVector(s.up, -rand(0.1, 0.5) * scale);
      s.particles.emit(Math.random() < 0.5 ? 'frost' : 'ice', this.point.x, this.point.y, this.point.z, this.v.x, this.v.y, this.v.z, rand(0.04, 0.08) * scale, rand(0.4, 0.7));
    }
    if (this.burst === 'pending') {
      this.burst = 'done';
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        this.at(s, Math.cos(a) * r, Math.sin(a) * r);
        this.v.copy(s.right).multiplyScalar(Math.cos(a)).addScaledVector(s.up, Math.sin(a)).multiplyScalar(rand(1.5, 3) * scale);
        const kind = Math.cos(a) > 0 ? 'fire' : 'ice';
        s.particles.emit(kind, this.point.x, this.point.y, this.point.z, this.v.x, this.v.y, this.v.z, rand(0.08, 0.14) * scale, rand(0.35, 0.55), { drag: 2.5, grow: 0.6 });
      }
    }
    return false;
  }

  /** Punto (x, y) del plano de la cámara respecto al centro del protagonista (en `point`). */
  private at(s: ActStage, x: number, y: number): void {
    this.point.copy(this.center).addScaledVector(s.right, x).addScaledVector(s.up, y);
  }

  end(): void {}
}

/** Acto de cada poder. Un poder nuevo necesita el suyo (lo exige el tipo). */
const ACTS: Record<SpecialPowerId, (props: THREE.Group) => PowerAct> = {
  giant: (props) => new GiantAct(props),
  ghoul: () => new GhoulAct(),
  fireIce: () => new FireIceAct(),
};

export interface CinematicCallbacks {
  /** Golpe contra el suelo (posición de mundo del aterrizaje y escala). */
  onImpact(at: THREE.Vector3, scale: number): void;
  /** Fin de la cinemática: aquí empieza de verdad el poder. */
  onDone(): void;
}

/**
 * Cinemática al recibir un poder especial:
 *  1. subida: sale del laberinto girando y vuela hasta quedar ante la cámara;
 *  2. acto: lo propio de cada poder (GIGANTE: come una cereza y crece; GHOUL:
 *     se oscurece, crece y le brotan los tentáculos);
 *  3. caída: baja acelerando a su sitio, mirando otra vez en su dirección;
 *  4. golpe y asentamiento: aplastamiento con rebote (el humo y la sacudida los
 *     pone quien escucha `onImpact`).
 * Produce una `HeroPose` por fotograma; no toca la lógica del jugador.
 */
export class PowerCinematic {
  readonly group = new THREE.Group();
  private stage: Stage = 'idle';
  private time = 0;
  private act: PowerAct | null = null;
  private callbacks: CinematicCallbacks | null = null;
  private pose: HeroPose = newPose();
  private start: HeroPose = newPose();
  private rest: HeroPose = newPose();
  /** El acto ha dibujado sus acompañantes (tentáculos) en este fotograma. */
  decorated = false;
  private top = new THREE.Vector3();
  private stageInfo: ActStage;
  private camera: THREE.PerspectiveCamera | null = null;
  private shakeFn: (amount: number) => void = () => {};
  private tmpQ = new THREE.Quaternion();

  constructor(tentacles: TentacleView, particles: ElementParticles) {
    const self = this;
    this.stageInfo = {
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      cameraQuat: new THREE.Quaternion(),
      closeUp(scale, size, out) {
        return out.copy(self.camera!.position).addScaledVector(this.forward, self.distanceFor(scale, size));
      },
      halfWidthAt(scale, size) {
        const cam = self.camera!;
        return self.distanceFor(scale, size) * Math.tan((cam.fov * DEG) / 2) * cam.aspect;
      },
      shake: (amount) => this.shakeFn(amount),
      props: this.group,
      tentacles,
      particles,
    };
  }

  get active(): boolean {
    return this.stage !== 'idle';
  }

  /**
   * @param current escala, altura y aspecto actuales del protagonista (por si ya tenía otro poder).
   * @param shake sacudida de cámara para los momentos fuertes del acto.
   */
  play(
    id: SpecialPowerId,
    player: Player,
    current: { scale: number; lift: number; look: HeroLook },
    shake: (amount: number) => void,
    callbacks: CinematicCallbacks,
  ): void {
    this.act?.end();
    this.act = ACTS[id](this.group);
    this.callbacks = callbacks;
    this.shakeFn = shake;
    PlayerView.restPose(player, current.scale, this.start, current.lift);
    this.start.look = current.look;
    this.stage = 'rise';
    this.time = 0;
  }

  /** Avanza la cinemática y devuelve la pose del protagonista (o null si no hay cinemática). */
  update(dt: number, camera: THREE.PerspectiveCamera, player: Player): HeroPose | null {
    if (this.stage === 'idle' || !this.act) return null;
    this.camera = camera;
    const s = this.stageInfo;
    s.cameraQuat.copy(camera.quaternion);
    s.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    s.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    s.forward.set(0, 0, -1).applyQuaternion(camera.quaternion);

    const cfg = CONFIG.specialPowers.cinematic;
    const p = this.pose;
    this.time += dt;
    this.decorated = false;

    if (this.stage === 'rise') {
      const k = Math.min(1, this.time / cfg.riseTime);
      const e = easeInOut(k);
      s.closeUp(1, cfg.closeUpSize, this.top);
      p.position.lerpVectors(this.start.position, this.top, e);
      // Gira (como disco y como moneda) mientras se orienta hacia la cámara.
      p.quaternion.slerpQuaternions(this.start.quaternion, s.cameraQuat, e);
      this.applyTurns(p.quaternion, e, cfg.riseTurns);
      p.scale.lerpVectors(this.start.scale, ONE, e);
      p.mouth = 0.5;
      p.look = this.start.look;
      p.spread = 1;
      if (k >= 1) this.next('act');
    } else if (this.stage === 'act') {
      const frame = this.act.update(Math.min(this.time, this.act.duration), s);
      s.closeUp(frame.scale, frame.size, p.position);
      p.quaternion.copy(s.cameraQuat);
      p.scale.setScalar(frame.scale);
      p.mouth = frame.mouth;
      p.look = frame.look;
      p.spread = frame.spread ?? 1;
      this.decorated = this.act.decorate?.('act', this.time, p, s) ?? false;
      if (this.time >= this.act.duration) {
        this.start.position.copy(p.position);
        this.start.quaternion.copy(p.quaternion);
        this.next('fall');
      }
    } else if (this.stage === 'fall') {
      const k = Math.min(1, this.time / cfg.fallTime);
      const e = k * k * k; // acelera: caída violenta
      const scale = this.act.finalScale;
      PlayerView.restPose(player, scale, this.rest, this.act.finalLift);
      p.position.lerpVectors(this.start.position, this.rest.position, e);
      p.quaternion.slerpQuaternions(this.start.quaternion, this.rest.quaternion, e);
      this.applyTurns(p.quaternion, e, cfg.fallTurns);
      p.scale.set(scale, scale, scale).lerp(this.rest.scale, e);
      p.mouth = 1;
      p.look = this.act.finalLook;
      p.spread = 1;
      this.decorated = this.act.decorate?.('fall', this.time, p, s) ?? false;
      if (k >= 1) {
        this.callbacks?.onImpact(this.rest.position, scale);
        this.next('settle');
      }
    } else if (this.stage === 'settle') {
      const scale = this.act.finalScale;
      PlayerView.restPose(player, scale, p, this.act.finalLift);
      p.look = this.act.finalLook;
      p.spread = 1;
      // Aplastamiento con rebote al tocar el suelo.
      const squash = 0.32 * Math.exp(-this.time * 9) * Math.cos(this.time * 24);
      p.scale.x *= 1 + squash;
      p.scale.y *= 1 - squash;
      p.mouth = 0.5;
      if (this.time >= cfg.settleTime) {
        this.stop();
        this.callbacks?.onDone();
        return p;
      }
    }
    return p;
  }

  /** Corta la cinemática (p. ej. al salir del modo). */
  stop(): void {
    this.act?.end();
    this.act = null;
    this.stage = 'idle';
  }

  /**
   * Añade vueltas completas según el avance `e` (0 → 1): sobre el eje vertical
   * (moneda) y sobre su propio eje (disco). Al llegar a 1 no queda giro.
   */
  private applyTurns(q: THREE.Quaternion, e: number, turns: { disc: number; flip: number }): void {
    q.multiply(this.tmpQ.setFromAxisAngle(Y_AXIS, e * Math.PI * 2 * turns.flip));
    q.multiply(this.tmpQ.setFromAxisAngle(Z_AXIS, e * Math.PI * 2 * turns.disc));
  }

  private next(stage: Stage): void {
    this.stage = stage;
    this.time = 0;
  }

  /** Distancia a la cámara a la que una figura de `scale` ocupa `size` de la altura de pantalla. */
  private distanceFor(scale: number, size: number): number {
    const cam = this.camera!;
    return (HERO_DIAMETER * scale) / (2 * Math.tan((cam.fov * DEG) / 2) * size);
  }

  dispose(): void {
    this.stop();
  }
}
