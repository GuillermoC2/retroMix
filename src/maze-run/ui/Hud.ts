import { CONFIG } from '../../config';
import type { RecordEntry } from '../../core/Records';
import { AltitudeDisplay } from './AltitudeDisplay';
import { RecordsList } from './RecordsList';
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
 * altura arriba, puntos en el centro y ayudas de control abajo. A la izquierda,
 * la lista de récords de distancia. Las columnas se calculan proyectando los
 * bordes del laberinto a pantalla.
 */
export class Hud {
  readonly root = el('div', 'hud');
  private altitude: AltitudeDisplay;
  private score: ScoreDisplay;
  private records: RecordsList;
  private keys = el('div', 'hud-keys');
  /** Habilidades compradas, encima de las ayudas de teclas. */
  private abilities = el('div', 'hud-abilities');
  private power = keyHint('Z', 'ROMPEMUROS');
  /** Usos de ROMPEMUROS, en grande a la derecha del nombre. */
  private charges = el('b', 'key-count');
  private chargesShown = '';
  /**
   * Tecla de acción general (X): "ACCION" en gris si no hay nada que hacer; si hay
   * una acción disponible (p. ej. DASH), su nombre y los segundos que le quedan en grande.
   */
  private action = keyHint('X', 'ACCION');
  private actionName = el('span', '', 'ACCION');
  private actionTime = el('b', 'key-count');
  private actionShown = 'init';
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
    this.power.label.classList.add('with-count');
    this.power.label.appendChild(this.charges);
    this.action.label.classList.add('with-count');
    this.action.label.replaceChildren(this.actionName, this.actionTime);
    this.keys.append(this.abilities, this.power.root, this.action.root, this.view.root);
    this.setAction(null);
    this.setAbilities([]);
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
    this.records = new RecordsList(this.root, records.topDistances);
  }

  setValues(meters: number, score: number): void {
    this.altitude.setMeters(meters);
    this.score.setScore(score);
  }

  /** Lista de récords de distancia actualizada (p. ej. al acabar la partida); `highlight` resalta un puesto. */
  setRecords(distances: number[], highlight = -1): void {
    this.records.set(distances, highlight);
  }

  /**
   * Coloca la columna del HUD centrada entre el laberinto y el borde derecho, y la
   * lista de récords entre el borde izquierdo y el laberinto.
   * @param mazeRightPx borde derecho del laberinto en pantalla (el más a la derecha de su altura visible).
   * @param mazeLeftPx borde izquierdo del laberinto en pantalla (el más a la izquierda).
   */
  anchor(mazeRightPx: number, mazeLeftPx: number): void {
    const { padding } = CONFIG.ui.layout;
    const W = window.innerWidth;
    this.records.anchor(mazeLeftPx / 2, Math.max(0, mazeLeftPx - 2 * padding));
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
    this.records.update(dt);
  }

  /** Usos que quedan de ROMPEMUROS (INF con el truco del modo dios). Al ganar uno, el número salta. */
  setPower(charges: number, devInfinite: boolean): void {
    const text = devInfinite ? 'INF' : String(charges);
    if (text === this.chargesShown) return;
    const gained = !devInfinite && this.chargesShown !== '' && charges > Number(this.chargesShown);
    this.chargesShown = text;
    this.charges.textContent = text;
    this.power.root.classList.toggle('empty', !devInfinite && charges <= 0);
    if (gained) {
      this.charges.classList.remove('gained');
      void this.charges.offsetWidth;
      this.charges.classList.add('gained');
    }
  }

  /**
   * Acción disponible en la tecla X: nombre, segundos que le quedan y si se puede
   * usar ya (si no, en gris, p. ej. mientras recarga). null = ninguna ("ACCION" en gris).
   */
  setAction(action: { name: string; seconds: number; ready: boolean } | null): void {
    const text = action ? `${action.name}|${Math.ceil(action.seconds)}|${action.ready}` : '';
    if (text === this.actionShown) return;
    this.actionShown = text;
    this.actionName.textContent = action?.name ?? 'ACCION';
    this.actionTime.textContent = action ? String(Math.ceil(action.seconds)) : '';
    this.action.root.classList.toggle('empty', !action?.ready);
  }

  /** Se ha pulsado la tecla de acción. */
  pressActionKey(): void {
    press(this.action.key);
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

  /**
   * Habilidades compradas: nombre, copias y color de su nivel.
   * @param highlight nombre de la recién comprada (salta un momento).
   */
  setAbilities(items: ReadonlyArray<{ name: string; color: string }>, highlight = ''): void {
    this.abilities.innerHTML = '';
    this.abilities.style.display = items.length ? '' : 'none';
    if (!items.length) return;
    this.abilities.append(el('div', 'hud-abilities-title', 'HABILIDADES'));
    for (const item of items) {
      const chip = el('div', `ability-chip${item.name === highlight ? ' new' : ''}`, item.name);
      chip.style.setProperty('--tier', item.color);
      this.abilities.append(chip);
    }
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
