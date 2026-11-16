import { CONFIG } from '../../config';
import type { RecordEntry } from '../../core/Records';
import { AltitudeDisplay } from './AltitudeDisplay';
import { RecordsList } from './RecordsList';
import { ScoreDisplay } from './ScoreDisplay';

/** Segmentos de la barra de tiempo del poder especial. */
const SPECIAL_SEGMENTS = 20;

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

/** Cabecera de sección: rótulo entre dos líneas de píxeles (la misma en todo el HUD). */
export function sectionHead(text: string): HTMLDivElement {
  return el('div', 'hud-head', text);
}

/**
 * Marcadores en pantalla, sin cajas, en una columna a la derecha del laberinto:
 * altura arriba, puntos debajo y, abajo, habilidades y controles. A la izquierda,
 * la lista de récords de distancia. Cada sección lleva la misma cabecera (rótulo
 * entre líneas) y un fondo oscuro suave detrás de cada columna las separa del
 * escenario. Las columnas se calculan proyectando los bordes del laberinto a pantalla.
 */
export class Hud {
  readonly root = el('div', 'hud');
  private altitude: AltitudeDisplay;
  private score: ScoreDisplay;
  private records: RecordsList;
  private keys = el('div', 'hud-keys');
  /** Habilidades compradas, encima de las ayudas de teclas. */
  private abilities = el('div', 'hud-abilities');
  /**
   * Tecla Z: ROMPEMUROS con sus usos en grande; con un poder especial, en gris (no se
   * puede romper muros) o la acción del poder (p. ej. HIELO con FUEGO HIELO).
   */
  private power = keyHint('Z', 'ROMPEMUROS');
  private powerName = el('span', '', 'ROMPEMUROS');
  /** Usos de ROMPEMUROS, en grande a la derecha del nombre. */
  private charges = el('b', 'key-count');
  private chargesShown = '';
  private powerShown = '';
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
  /** Aviso de inicio: teclas de dirección y "PARA EMPEZAR". */
  private startHint = el('div', 'hud-start');
  private god = el('div', 'hud-god', 'MODO DIOS [K]');
  /** Poder especial activo: nombre, barra de tiempo por segmentos y segundos que quedan. */
  private special = el('div', 'hud-special');
  private specialName = el('div', 'hud-special-name');
  private specialBar = el('div', 'hud-special-bar');
  private specialFill = el('div', 'hud-special-fill');
  private specialTime = el('b', 'hud-special-time');
  private announcer = el('div', 'hud-announce');
  /** Viñeta de TIEMPO LENTO (parpadea al acabarse). */
  private slowMo = el('div', 'hud-slowmo');
  /** Fondos oscuros suaves detrás de cada columna (para que se lean sobre el escenario). */
  private scrimLeft = el('div', 'hud-scrim left');
  private scrimRight = el('div', 'hud-scrim right');

  constructor(parent: HTMLElement, records: RecordEntry) {
    this.power.label.classList.add('with-count');
    this.power.label.replaceChildren(this.powerName, this.charges);
    this.action.label.classList.add('with-count');
    this.action.label.replaceChildren(this.actionName, this.actionTime);
    const controls = sectionHead('CONTROLES');
    controls.classList.add('hud-keys-head');
    this.keys.append(this.abilities, controls, this.power.root, this.action.root, this.view.root);
    this.setAction(null);
    this.setAbilities([]);
    this.specialBar.appendChild(this.specialFill);
    const specialRow = el('div', 'hud-special-row');
    specialRow.append(this.specialBar, this.specialTime);
    this.special.append(this.specialName, specialRow);
    for (const dir of ['up', 'left', 'down', 'right']) this.startHint.append(el('span', `key arrow ${dir}`));
    this.startHint.append(el('span', 'hud-start-text', 'PARA EMPEZAR'));
    this.root.append(this.slowMo, this.scrimLeft, this.scrimRight, this.keys, this.startHint, this.god, this.special, this.announcer);
    this.setGodMode('');
    this.setSpecial(null);
    this.setStartHint(false);
    // Al acabar, el anuncio se retira del todo: si se quedara con `show`, al volver a mostrar la
    // interfaz (tras un minijuego o el menú K) el navegador repetiría la animación con el texto viejo.
    // (Solo la animación del propio anuncio: las de sus letras también llegan aquí.)
    this.announcer.addEventListener('animationend', (e) => {
      if (e.target === this.announcer) this.clearAnnounce();
    });
    parent.appendChild(this.root);
    this.score = new ScoreDisplay(this.root, records.bestScore);
    this.altitude = new AltitudeDisplay(this.root, records.bestDistance);
    this.records = new RecordsList(this.root, records.topDistances);
  }

  setValues(meters: number, score: number): void {
    this.altitude.setMeters(meters);
    this.score.setScore(score);
  }

  /** Todos los récords de nuevo (p. ej. tras borrarlos desde el menú K): mejores marcas y lista. */
  setAllRecords(records: RecordEntry): void {
    this.score.setBest(records.bestScore);
    this.altitude.setBest(records.bestDistance);
    this.records.set(records.topDistances);
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
    this.scrimLeft.style.width = `${Math.max(0, Math.round(mazeLeftPx))}px`;
    this.scrimRight.style.width = `${Math.max(0, Math.round(W - mazeRightPx))}px`;
    // Anuncios y avisos van centrados en el laberinto y la banda del anuncio lo cruza de lado a lado.
    this.root.style.setProperty('--maze-x', `${Math.round((mazeLeftPx + mazeRightPx) / 2)}px`);
    this.root.style.setProperty('--maze-w', `${Math.round(mazeRightPx - mazeLeftPx)}px`);
    this.records.anchor(mazeLeftPx / 2, Math.max(0, mazeLeftPx - 2 * padding));
    const x = (mazeRightPx + W) / 2;
    const available = Math.max(0, W - mazeRightPx - 2 * padding);
    // Ancho útil de cada columna: cabeceras y listas no lo sobrepasan.
    this.root.style.setProperty('--col-right', `${Math.round(available)}px`);
    this.root.style.setProperty('--col-left', `${Math.round(Math.max(0, mazeLeftPx - 2 * padding))}px`);
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

  /**
   * Tecla Z. Usos que quedan de ROMPEMUROS (INF con el truco del modo dios); al ganar
   * uno, el número salta. `blocked`: no se puede romper muros (hay un poder especial).
   * `override`: la Z hace otra cosa (la acción del poder), con su nombre y si está lista.
   */
  setPower(charges: number, devInfinite: boolean, blocked = false, override: { name: string; ready: boolean } | null = null): void {
    const mode = override ? `${override.name}|${override.ready}` : `ROMPEMUROS|${blocked}`;
    if (mode !== this.powerShown) {
      this.powerShown = mode;
      this.powerName.textContent = override?.name ?? 'ROMPEMUROS';
      this.charges.style.display = override ? 'none' : '';
    }
    const text = devInfinite ? 'INF' : String(charges);
    this.power.root.classList.toggle('empty', override ? !override.ready : blocked || (!devInfinite && charges <= 0));
    if (text === this.chargesShown) return;
    const gained = !devInfinite && this.chargesShown !== '' && charges > Number(this.chargesShown);
    this.chargesShown = text;
    this.charges.textContent = text;
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
    this.abilities.append(sectionHead('HABILIDADES'));
    const list = el('div', 'hud-abilities-list');
    for (const item of items) {
      const chip = el('div', `ability-chip${item.name === highlight ? ' new' : ''}`, item.name);
      chip.style.setProperty('--tier', item.color);
      list.append(chip);
    }
    this.abilities.append(list);
  }

  /** Se ha cambiado de vista. */
  pressViewKey(): void {
    press(this.view.key);
  }

  /**
   * Poder especial activo (o `null` si no hay ninguno).
   * @param remaining fracción de tiempo restante (1 → 0).
   * @param warning a punto de acabarse: parpadea.
   * @param seconds segundos que quedan (se muestran junto a la barra).
   * @param color color del poder (CSS).
   */
  setSpecial(name: string | null, remaining = 0, warning = false, seconds = 0, color = ''): void {
    this.special.style.display = name ? '' : 'none';
    if (!name) return;
    if (this.specialName.textContent !== name) {
      this.specialName.textContent = name;
      if (color) this.special.style.setProperty('--c', color);
    }
    // La barra baja por segmentos (pixel art).
    this.specialFill.style.width = `${Math.ceil(remaining * SPECIAL_SEGMENTS) * (100 / SPECIAL_SEGMENTS)}%`;
    const time = String(Math.ceil(seconds));
    if (this.specialTime.textContent !== time) this.specialTime.textContent = time;
    this.special.classList.toggle('warning', warning);
  }

  /**
   * Anuncio grande (p. ej. al ganar un poder): una banda oscura cruza el laberinto,
   * el texto cae letra a letra y debajo sale una etiqueta con el subtítulo.
   * @param color color del anuncio (CSS).
   */
  announce(text: string, sub = '', color = ''): void {
    this.announcer.innerHTML = '';
    this.announcer.style.setProperty('--c', color || 'var(--yellow)');
    const main = el('div', 'hud-announce-main');
    [...text].forEach((ch, i) => {
      const letter = el('span', 'hud-announce-char', ch);
      letter.style.setProperty('--i', String(i));
      main.append(letter);
    });
    this.announcer.append(el('div', 'hud-announce-band'), main);
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

  /** TIEMPO LENTO: viñeta de color en los bordes de la pantalla; `warning` la hace parpadear. */
  setSlowMo(on: boolean, warning: boolean): void {
    this.slowMo.classList.toggle('on', on);
    this.slowMo.classList.toggle('warn', on && warning);
  }

  /** Aviso de inicio ("pulsa una dirección para empezar") con las teclas dibujadas. */
  setStartHint(visible: boolean): void {
    this.startHint.style.display = visible ? '' : 'none';
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
