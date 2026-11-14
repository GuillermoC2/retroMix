import { CONFIG } from '../../config';
import type { RecordEntry } from '../../core/Records';
import { AltitudeDisplay } from './AltitudeDisplay';
import { ScoreDisplay } from './ScoreDisplay';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') => {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
};

/** Ayuda de control: icono de tecla pixelado + texto. */
function keyHint(key: string, label: string): { root: HTMLDivElement; key: HTMLSpanElement; label: HTMLDivElement } {
  const root = el('div', 'key-hint');
  const keyEl = el('span', 'key', key);
  const labelEl = el('div', 'key-label', label);
  root.append(keyEl, labelEl);
  return { root, key: keyEl, label: labelEl };
}

/** Hunde la tecla un instante (como si se pulsara). */
function press(key: HTMLElement): void {
  key.classList.remove('pressed');
  void key.offsetWidth;
  key.classList.add('pressed');
}

/**
 * Marcadores en pantalla, sin cajas, en una columna a la derecha del laberinto:
 * altura arriba, puntos en el centro y ayudas de control abajo. La columna se
 * calcula proyectando el borde del laberinto a pantalla.
 */
export class Hud {
  readonly root = el('div', 'hud');
  private altitude: AltitudeDisplay;
  private score: ScoreDisplay;
  private keys = el('div', 'hud-keys');
  private power = keyHint('ESPACIO', 'ROMPER MURO');
  private charges = el('div', 'key-sub');
  private chargesShown = '';
  private view = keyHint('C', 'CAMBIAR VISTA');
  /** Anchura de las ayudas en dos columnas (tecla | texto), medida mientras se muestran así. */
  private keysWideWidth = 0;
  private message = el('div', 'hud-message');
  private god = el('div', 'hud-god', 'MODO DIOS [K]');
  /** Poder especial activo: nombre y barra de tiempo restante. */
  private special = el('div', 'hud-special');
  private specialName = el('div', 'hud-special-name');
  private specialBar = el('div', 'hud-special-bar');
  private specialFill = el('div', 'hud-special-fill');
  private announcer = el('div', 'hud-announce');

  constructor(parent: HTMLElement, records: RecordEntry) {
    this.power.label.appendChild(this.charges);
    this.keys.append(this.power.root, this.view.root);
    this.specialBar.appendChild(this.specialFill);
    this.special.append(this.specialName, this.specialBar);
    this.root.append(this.keys, this.message, this.god, this.special, this.announcer);
    this.setGodMode('');
    this.setSpecial(null);
    // Al acabar, el anuncio se retira del todo: si se quedara con `show`, al volver a mostrar la
    // interfaz (tras un minijuego o el menú K) el navegador repetiría la animación con el texto viejo.
    this.announcer.addEventListener('animationend', () => this.clearAnnounce());
    parent.appendChild(this.root);
    this.score = new ScoreDisplay(this.root, records.bestScore);
    this.altitude = new AltitudeDisplay(this.root, records.bestDistance);
  }

  setValues(meters: number, score: number): void {
    this.altitude.setMeters(meters);
    this.score.setScore(score);
  }

  /**
   * Coloca la columna del HUD centrada entre el laberinto y el borde derecho.
   * @param mazeRightPx borde derecho del laberinto en pantalla (el más a la derecha de su altura visible).
   */
  anchor(mazeRightPx: number): void {
    const { padding } = CONFIG.ui.layout;
    const W = window.innerWidth;
    const x = (mazeRightPx + W) / 2;
    const available = Math.max(0, W - mazeRightPx - 2 * padding);
    this.altitude.anchor(x, available);
    this.score.anchor(x, this.altitude.bottom + CONFIG.ui.score.gapBelowAltitude, available);
    this.keys.style.left = `${Math.round(x)}px`;
    // Si no caben en dos columnas, el texto pasa debajo de la tecla; si aun así no caben, se encogen.
    if (!this.keys.classList.contains('stacked')) this.keysWideWidth = this.keys.offsetWidth;
    this.keys.classList.toggle('stacked', available < this.keysWideWidth);
    const keysWidth = this.keys.offsetWidth;
    const fit = keysWidth > 0 ? Math.min(1, available / keysWidth) : 1;
    this.keys.style.transform = `translateX(-50%) scale(${fit.toFixed(3)})`;
  }

  /** Animaciones por fotograma (cifras flotantes). */
  update(dt: number): void {
    this.altitude.update(dt);
    this.score.update(dt);
  }

  /** Cargas del poder romper muro. */
  setPower(charges: number, devInfinite: boolean): void {
    const text = devInfinite ? 'CARGAS INF (DIOS)' : `CARGAS ${charges}`;
    if (text === this.chargesShown) return;
    this.chargesShown = text;
    this.charges.textContent = text;
    this.power.root.classList.toggle('empty', !devInfinite && charges <= 0);
  }

  /** Se ha pulsado el poder (funcione o no). */
  pressPowerKey(): void {
    press(this.power.key);
  }

  /** Destello del indicador cuando el poder rompe un muro. */
  pulsePower(): void {
    this.power.label.classList.remove('bump');
    void this.power.label.offsetWidth;
    this.power.label.classList.add('bump');
  }

  /** Se ha cambiado de vista. */
  pressViewKey(): void {
    press(this.view.key);
  }

  /**
   * Poder especial activo (o `null` si no hay ninguno).
   * @param remaining fracción de tiempo restante (1 → 0).
   * @param warning a punto de acabarse: parpadea.
   */
  setSpecial(name: string | null, remaining = 0, warning = false): void {
    this.special.style.display = name ? '' : 'none';
    if (!name) return;
    if (this.specialName.textContent !== name) this.specialName.textContent = name;
    // La barra baja en escalones de 1/20 (pixel art).
    this.specialFill.style.width = `${Math.ceil(remaining * 20) * 5}%`;
    this.special.classList.toggle('warning', warning);
  }

  /** Texto grande que aparece en el centro y se desvanece (p. ej. al ganar un poder). */
  announce(text: string, sub = ''): void {
    this.announcer.innerHTML = '';
    this.announcer.append(el('div', 'hud-announce-main', text));
    if (sub) this.announcer.append(el('div', 'hud-announce-sub', sub));
    this.announcer.classList.remove('show');
    void this.announcer.offsetWidth;
    this.announcer.classList.add('show');
  }

  /** Indicador de trucos de modo dios activos (herramienta de desarrollo); vacío lo oculta. */
  setGodMode(text: string): void {
    this.god.textContent = text;
    this.god.style.display = text ? '' : 'none';
  }

  setMessage(text: string, blink = false): void {
    this.message.textContent = text;
    this.message.classList.toggle('blink', blink);
    this.message.style.display = text ? '' : 'none';
  }

  setVisible(visible: boolean): void {
    // Un anuncio a medias no se repite al volver (ver el constructor).
    if (!visible) this.clearAnnounce();
    this.root.style.display = visible ? '' : 'none';
  }

  private clearAnnounce(): void {
    this.announcer.classList.remove('show');
    this.announcer.innerHTML = '';
  }

  dispose(): void {
    this.root.remove();
  }
}
