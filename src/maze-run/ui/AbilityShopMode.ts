import { CONFIG } from '../../config';
import type { GameContext } from '../../core/Game';
import type { Action } from '../../core/Input';
import type { GameMode } from '../../core/ModeStack';
import { abilityName, type AbilityDef, type PixelIcon } from '../abilities/catalog';
import type { ShopSlot } from '../systems/Abilities';

export interface ShopHooks {
  /** Se ha perdido el minijuego del muro: las cartas se ven, pero no se puede escoger ninguna. */
  blocked?: boolean;
  slots: ShopSlot[];
  /** Puntos disponibles ahora mismo. */
  points: () => number;
  /** Nivel que ya tiene el jugador de una habilidad (0 = no la tiene; si la tiene, se ofrece su mejora). */
  level: (ability: AbilityDef) => number;
  /** Intenta comprar la casilla (descuenta los puntos y la concede). @returns si se ha comprado. */
  buy: (slot: ShopSlot) => boolean;
  /** La tienda se ha cerrado (este modo ya se ha retirado); `bought` es lo comprado, si algo. */
  done: (bought: AbilityDef | null) => void;
}

const SLOT_KEYS: readonly Action[] = ['opt1', 'opt2', 'opt3'];
/** Índice del botón de salir en la selección (tras las cartas). */
const EXIT = 3;

/** Dibuja un icono pixel art en un canvas (se escala por CSS sin suavizado). */
function iconCanvas(icon: PixelIcon): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'shop-icon';
  canvas.width = Math.max(...icon.rows.map((r) => r.length));
  canvas.height = icon.rows.length;
  const g = canvas.getContext('2d')!;
  icon.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const color = icon.palette[ch];
      if (!color) return;
      g.fillStyle = color;
      g.fillRect(x, y, 1, 1);
    }),
  );
  return canvas;
}

const el = (tag: string, className: string, text = ''): HTMLElement => {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
};

/**
 * Tienda de habilidades tras superar un muro portal: tres cartas grandes que
 * flotan ocupando la pantalla, una por nivel (básica azul, épica morada,
 * legendaria dorada), cada una con su precio en puntos. Se compra una como
 * mucho; sin puntos suficientes la carta queda bloqueada. Una casilla sin
 * habilidad se muestra vacía.
 *
 * Teclas: ← → (o A/D) elegir, Enter/Espacio comprar, 1–3 comprar directamente,
 * ↓ y Enter o Esc salir sin comprar. También con el ratón.
 */
export class AbilityShopMode implements GameMode {
  readonly overlay = true;
  private root = el('div', 'shop');
  private cards: HTMLElement[] = [];
  private exitButton = el('button', 'shop-exit', 'CONTINUAR SIN COMPRAR');
  private pointsNumber = el('b', '');
  private selected = 0;
  private time = 0;
  private shownPoints: number;
  /** Tiempo hasta cerrar tras una compra (-1 = sin cerrar). */
  private closing = -1;
  private bought: AbilityDef | null = null;
  private closed = false;

  constructor(
    private ctx: GameContext,
    private hooks: ShopHooks,
  ) {
    this.shownPoints = hooks.points();
  }

  enter(): void {
    const head = el('div', 'shop-head');
    const points = el('div', 'shop-points', 'PUNTOS ');
    points.appendChild(this.pointsNumber);
    const blocked = !!this.hooks.blocked;
    this.root.classList.toggle('blocked', blocked);
    if (blocked) this.exitButton.textContent = 'CONTINUAR';
    head.append(
      el('div', 'shop-title', blocked ? 'MURO SUPERADO' : '¡MURO SUPERADO!'),
      el('div', 'shop-sub', blocked ? 'HAS PERDIDO: NO PUEDES ESCOGER HABILIDAD' : 'ELIGE UNA HABILIDAD'),
      points,
    );

    const row = el('div', 'shop-cards');
    this.hooks.slots.forEach((slot, i) => {
      const float = el('div', 'shop-slot');
      float.style.setProperty('--d', String(i));
      const enter = el('div', 'shop-enter');
      const card = this.buildCard(slot, i);
      enter.appendChild(card);
      float.appendChild(enter);
      row.appendChild(float);
      this.cards.push(card);
    });

    const foot = el('div', 'shop-foot');
    this.exitButton.addEventListener('mouseenter', () => this.select(EXIT));
    this.exitButton.addEventListener('click', () => this.ready && this.close());
    const keys = el('div', 'shop-keys');
    keys.innerHTML = blocked
      ? '<span class="key">ENTER</span> CONTINUAR'
      : '<span class="key">&lt;</span><span class="key">&gt;</span> ELEGIR · <span class="key">ENTER</span> COMPRAR · <span class="key">ESC</span> SALIR';
    foot.append(this.exitButton, keys);

    this.root.append(head, row, foot);
    this.ctx.ui.appendChild(this.root);
    // Empieza elegida la carta más cara que se pueda pagar; si ninguna, el botón de salir.
    const affordable = this.hooks.slots.map((_, i) => i).filter((i) => this.canBuy(i));
    this.select(affordable.length ? affordable[affordable.length - 1] : EXIT);
    this.refresh();
  }

  private buildCard(slot: ShopSlot, index: number): HTMLElement {
    const tier = CONFIG.abilities.tiers[slot.tier];
    const card = el('button', `shop-card tier-${slot.tier}`);
    card.style.setProperty('--tier', tier.color);
    card.append(el('div', 'shop-tier', tier.name), el('div', 'shop-key', String(index + 1)));
    const a = slot.ability;
    if (a) {
      const level = this.hooks.level(a);
      const upgrade = level > 0;
      card.append(
        iconCanvas(a.icon),
        el('div', 'shop-name', abilityName(a, level + 1)),
        el('div', 'shop-desc', upgrade && a.upgradeDescription ? a.upgradeDescription : a.description),
        el('div', 'shop-owned', upgrade ? 'MEJORA' : ''),
      );
    } else {
      card.classList.add('empty');
      card.append(el('div', 'shop-icon shop-icon-empty', '?'), el('div', 'shop-name', 'VACIA'), el('div', 'shop-desc', 'PROXIMAMENTE'));
    }
    card.append(el('div', 'shop-price', `${tier.price} PTS`), el('div', 'shop-need', ''));
    card.addEventListener('mouseenter', () => this.select(index));
    card.addEventListener('click', () => this.ready && this.tryBuy(index));
    return card;
  }

  exit(): void {
    this.root.remove();
  }

  private get ready(): boolean {
    return this.time >= CONFIG.abilities.shop.inputDelay && this.closing < 0 && !this.closed;
  }

  private canBuy(i: number): boolean {
    if (this.hooks.blocked) return false;
    const slot = this.hooks.slots[i];
    return !!slot?.ability && this.hooks.points() >= CONFIG.abilities.tiers[slot.tier].price;
  }

  update(dt: number): void {
    this.time += dt;
    const { input } = this.ctx;
    // La cifra de puntos cuenta hacia el valor real (baja al comprar).
    const target = this.hooks.points();
    this.shownPoints += (target - this.shownPoints) * (1 - Math.exp(-dt * 7));
    if (Math.abs(target - this.shownPoints) < 5) this.shownPoints = target;
    this.pointsNumber.textContent = String(Math.round(this.shownPoints / 10) * 10);

    if (this.closing >= 0) {
      this.closing -= dt;
      if (this.closing < 0) this.close();
      return;
    }
    if (!this.ready) return;

    const n = this.hooks.slots.length;
    if (input.pressed('back')) return this.close();
    if (input.pressed('left')) this.select(this.selected === EXIT ? n - 1 : Math.max(0, this.selected - 1));
    if (input.pressed('right')) this.select(this.selected === EXIT ? EXIT : Math.min(n - 1, this.selected + 1));
    if (input.pressed('down')) this.select(EXIT);
    if (input.pressed('up') && this.selected === EXIT) this.select(Math.floor(n / 2));
    SLOT_KEYS.forEach((key, i) => {
      if (input.pressed(key) && i < n) {
        this.select(i);
        this.tryBuy(i);
      }
    });
    if (input.pressed('confirm')) {
      if (this.selected === EXIT) this.close();
      else this.tryBuy(this.selected);
    }
  }

  private select(index: number): void {
    if (this.closing >= 0) return;
    // Bloqueada: ninguna carta se puede elegir, así que Enter siempre continúa.
    this.selected = this.hooks.blocked ? EXIT : index;
    index = this.selected;
    this.cards.forEach((c, i) => c.classList.toggle('selected', i === index));
    this.exitButton.classList.toggle('selected', index === EXIT);
  }

  private tryBuy(index: number): void {
    const slot = this.hooks.slots[index];
    const card = this.cards[index];
    if (!slot.ability || this.hooks.blocked || !this.hooks.buy(slot)) {
      // No se puede: la carta tiembla.
      card.classList.remove('denied');
      void card.offsetWidth;
      card.classList.add('denied');
      return;
    }
    this.bought = slot.ability;
    card.classList.add('bought');
    card.querySelector('.shop-price')!.textContent = '¡COMPRADA!';
    this.cards.forEach((c, i) => c.classList.toggle('faded', i !== index));
    this.exitButton.classList.add('faded');
    this.closing = CONFIG.abilities.shop.closeDelay;
    this.refresh();
  }

  /** Bloqueo por falta de puntos y lo que falta para cada carta. */
  private refresh(): void {
    const points = this.hooks.points();
    this.hooks.slots.forEach((slot, i) => {
      const card = this.cards[i];
      if (!slot.ability || card.classList.contains('bought')) return;
      if (this.hooks.blocked) {
        card.classList.add('locked');
        card.querySelector('.shop-need')!.textContent = 'BLOQUEADA';
        return;
      }
      const missing = CONFIG.abilities.tiers[slot.tier].price - points;
      card.classList.toggle('locked', missing > 0);
      card.querySelector('.shop-need')!.textContent = missing > 0 ? `FALTAN ${missing}` : '';
    });
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    this.ctx.modes.pop();
    this.hooks.done(this.bought);
  }

  render(): void {}
}
