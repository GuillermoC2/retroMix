import * as THREE from 'three';
import { CONFIG, type SpecialPowerId } from '../../config';
import type { Player } from '../entities/Player';
import { PlayerView, type HeroPose } from '../entities/PlayerView';
import { HERO_DIAMETER, cherryGeometry } from '../entities/sprites';

type Stage = 'idle' | 'rise' | 'act' | 'fall' | 'settle';

/** Lo que devuelve el acto de un poder en cada fotograma. */
interface ActFrame {
  /** Escala del protagonista en el mundo. */
  scale: number;
  /** Tamaño aparente: fracción de la altura de pantalla que ocupa. */
  size: number;
  /** Apertura de la boca (0–1). */
  mouth: number;
}

/** Parte central de la cinemática, propia de cada poder. */
interface PowerAct {
  readonly duration: number;
  /** Escala con la que cae y aterriza. */
  readonly finalScale: number;
  update(t: number, stage: ActStage): ActFrame;
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
}

const DEG = Math.PI / 180;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
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
      return { scale: 1, size: startSize, mouth: 0.5 + 0.5 * k };
    }
    this.cherry.visible = false;

    // 2. Mordiscos.
    const tc = t - cherryTime;
    if (tc < chompTime) {
      return { scale: 1, size: startSize * pop(tc, 0.08), mouth: Math.abs(Math.cos((tc / chompTime) * Math.PI * 3)) };
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
    };
  }

  end(): void {
    this.props.remove(this.cherry);
    (this.cherry.material as THREE.Material).dispose();
  }
}

/** Acto de cada poder. Un poder nuevo necesita el suyo (lo exige el tipo). */
const ACTS: Record<SpecialPowerId, (props: THREE.Group) => PowerAct> = {
  giant: (props) => new GiantAct(props),
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
 *  2. acto: lo propio de cada poder (GIGANTE: come una cereza y crece);
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
  private pose: HeroPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(), mouth: 0.5 };
  private start = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(), mouth: 0.5 };
  private rest: HeroPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(), mouth: 0.5 };
  private top = new THREE.Vector3();
  private stageInfo: ActStage;
  private camera: THREE.PerspectiveCamera | null = null;
  private shakeFn: (amount: number) => void = () => {};
  private tmpQ = new THREE.Quaternion();

  constructor() {
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
    };
  }

  get active(): boolean {
    return this.stage !== 'idle';
  }

  /**
   * @param currentScale escala actual del protagonista (por si ya era grande).
   * @param shake sacudida de cámara para los momentos fuertes del acto.
   */
  play(id: SpecialPowerId, player: Player, currentScale: number, shake: (amount: number) => void, callbacks: CinematicCallbacks): void {
    this.act?.end();
    this.act = ACTS[id](this.group);
    this.callbacks = callbacks;
    this.shakeFn = shake;
    PlayerView.restPose(player, currentScale, this.start);
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
      if (k >= 1) this.next('act');
    } else if (this.stage === 'act') {
      const frame = this.act.update(Math.min(this.time, this.act.duration), s);
      s.closeUp(frame.scale, frame.size, p.position);
      p.quaternion.copy(s.cameraQuat);
      p.scale.setScalar(frame.scale);
      p.mouth = frame.mouth;
      if (this.time >= this.act.duration) {
        this.start.position.copy(p.position);
        this.start.quaternion.copy(p.quaternion);
        this.next('fall');
      }
    } else if (this.stage === 'fall') {
      const k = Math.min(1, this.time / cfg.fallTime);
      const e = k * k * k; // acelera: caída violenta
      const scale = this.act.finalScale;
      PlayerView.restPose(player, scale, this.rest);
      p.position.lerpVectors(this.start.position, this.rest.position, e);
      p.quaternion.slerpQuaternions(this.start.quaternion, this.rest.quaternion, e);
      this.applyTurns(p.quaternion, e, cfg.fallTurns);
      p.scale.set(scale, scale, scale).lerp(this.rest.scale, e);
      p.mouth = 1;
      if (k >= 1) {
        this.callbacks?.onImpact(this.rest.position, scale);
        this.next('settle');
      }
    } else if (this.stage === 'settle') {
      const scale = this.act.finalScale;
      PlayerView.restPose(player, scale, p);
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
