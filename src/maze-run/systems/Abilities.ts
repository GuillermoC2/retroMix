import { CONFIG, type AbilityTier } from '../../config';
import type { PickupKind } from './Pickups';
import type { Rng } from '../../core/Rng';
import { ABILITIES, TIERS, maxLevel, type AbilityDef } from '../abilities/catalog';

/** Una casilla de la tienda: su nivel y la habilidad que ofrece (o ninguna). */
export interface ShopSlot {
  tier: AbilityTier;
  ability: AbilityDef | null;
}

/**
 * Habilidades compradas en la partida (permanentes hasta el final). Cada una se
 * compra una sola vez, salvo las que tienen mejoras (`maxLevel`): cada nivel
 * vuelve a sumar su efecto.
 */
export class Abilities {
  /** Habilidades compradas, con su nivel. */
  readonly owned = new Map<AbilityDef, number>();

  /**
   * Oferta de la tienda: una casilla por nivel, con una habilidad al azar de ese
   * nivel que aún se pueda comprar (vacía si no queda ninguna).
   */
  offer(rng: Rng): ShopSlot[] {
    return TIERS.map((tier) => {
      const pool = ABILITIES.filter((a) => a.tier === tier && this.canBuy(a));
      return { tier, ability: pool.length ? rng.pick(pool) : null };
    });
  }

  /** ¿Le quedan niveles por comprar? */
  canBuy(ability: AbilityDef): boolean {
    return this.level(ability) < maxLevel(ability);
  }

  /** Sube un nivel (si no está al máximo). @returns si se ha añadido. */
  add(ability: AbilityDef): boolean {
    if (!this.canBuy(ability)) return false;
    this.owned.set(ability, this.level(ability) + 1);
    return true;
  }

  /** Nivel comprado (0 = no la tiene). */
  level(ability: AbilityDef): number {
    return this.owned.get(ability) ?? 0;
  }

  /** Segundos extra del susto de los energizadores. */
  get frightBonus(): number {
    return this.sum((a) => a.effects.frightBonus ?? 0);
  }

  /** ROMPEMUROS extra al superar un muro portal (MAS ROMPEMUROS). */
  get wallBreaksPerGate(): number {
    return this.sum((a) => a.effects.wallBreaksPerGate ?? 0);
  }

  /** Objetos que deben aparecer por el laberinto (uno por habilidad que los siembra). */
  get pickups(): PickupKind[] {
    return [...this.owned.keys()].flatMap((a) => (a.effects.pickup ? [a.effects.pickup] : []));
  }

  /** Segundos que dura el láser al comer una bola (0 sin la habilidad; LASER + suma `plusBonus`). */
  get laserDuration(): number {
    const { duration, plusBonus } = CONFIG.abilities.laser;
    return this.leveled('laser', duration, plusBonus);
  }

  /** Segundos que dura el imán al coger uno (IMAN + suma `plusBonus`). */
  get magnetDuration(): number {
    const { duration, plusBonus } = CONFIG.abilities.magnet;
    return this.leveled('magnet', duration, plusBonus);
  }

  /** `base` con el nivel 1 y `perLevel` más por cada mejora; 0 sin la habilidad. */
  private leveled(id: string, base: number, perLevel: number): number {
    const level = this.levelOf(id);
    return level ? base + perLevel * (level - 1) : 0;
  }

  private levelOf(id: string): number {
    for (const [a, n] of this.owned) if (a.id === id) return n;
    return 0;
  }

  private sum(value: (a: AbilityDef) => number): number {
    let total = 0;
    for (const [a, n] of this.owned) total += value(a) * n;
    return total;
  }
}
