import type { AbilityTier } from '../../config';
import type { Rng } from '../../core/Rng';
import { ABILITIES, TIERS, type AbilityDef } from '../abilities/catalog';

/** Una casilla de la tienda: su nivel y la habilidad que ofrece (o ninguna). */
export interface ShopSlot {
  tier: AbilityTier;
  ability: AbilityDef | null;
}

/**
 * Habilidades compradas en la partida (permanentes hasta el final). Se pueden
 * comprar varias veces: cada copia vuelve a sumar su efecto.
 */
export class Abilities {
  /** Habilidades compradas, con cuántas copias de cada una. */
  readonly owned = new Map<AbilityDef, number>();

  /** Oferta de la tienda: una casilla por nivel, con una habilidad al azar de ese nivel (vacía si no hay). */
  offer(rng: Rng): ShopSlot[] {
    return TIERS.map((tier) => {
      const pool = ABILITIES.filter((a) => a.tier === tier);
      return { tier, ability: pool.length ? rng.pick(pool) : null };
    });
  }

  add(ability: AbilityDef): void {
    this.owned.set(ability, (this.owned.get(ability) ?? 0) + 1);
  }

  count(ability: AbilityDef): number {
    return this.owned.get(ability) ?? 0;
  }

  /** Segundos extra del susto de los energizadores. */
  get frightBonus(): number {
    return this.sum((a) => a.effects.frightBonus ?? 0);
  }

  private sum(value: (a: AbilityDef) => number): number {
    let total = 0;
    for (const [a, n] of this.owned) total += value(a) * n;
    return total;
  }
}
