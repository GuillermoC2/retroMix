const KEY = 'retromix.records.v1';

/** Cuántas distancias se guardan en la lista de récords de cada juego. */
export const TOP_DISTANCES = 5;

export interface RecordEntry {
  bestDistance: number;
  bestScore: number;
  /** Mejores distancias, de mayor a menor (como mucho `TOP_DISTANCES`). */
  topDistances: number[];
}

export interface SubmitResult {
  distance: boolean;
  score: boolean;
  /** Puesto (0 = el mejor) de esta partida en la lista de distancias, o -1 si no entra. */
  distanceRank: number;
}

/** Récords persistidos en localStorage. Si el almacenamiento no está disponible, funciona solo en memoria. */
export class Records {
  private data: Record<string, Partial<RecordEntry>> = {};

  constructor() {
    try {
      this.data = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    } catch {
      this.data = {};
    }
  }

  get(game: string): RecordEntry {
    const d = this.data[game] ?? {};
    const bestDistance = d.bestDistance ?? 0;
    // Los récords guardados antes de existir la lista empiezan con su mejor distancia.
    const topDistances = d.topDistances ?? (bestDistance > 0 ? [bestDistance] : []);
    return { bestDistance, bestScore: d.bestScore ?? 0, topDistances: [...topDistances] };
  }

  /** Registra un resultado y devuelve qué récords se han batido. */
  submit(game: string, distance: number, score: number): SubmitResult {
    const prev = this.get(game);
    const top = prev.topDistances;
    let distanceRank = -1;
    if (distance > 0) {
      // Ante un empate, la partida nueva va detrás de la que ya estaba.
      const at = top.findIndex((d) => distance > d);
      distanceRank = at < 0 ? top.length : at;
      top.splice(distanceRank, 0, distance);
      if (distanceRank >= TOP_DISTANCES) distanceRank = -1;
      top.length = Math.min(top.length, TOP_DISTANCES);
    }
    this.data[game] = {
      bestDistance: Math.max(prev.bestDistance, distance),
      bestScore: Math.max(prev.bestScore, score),
      topDistances: top,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* almacenamiento no disponible: se mantiene en memoria */
    }
    return { distance: distance > prev.bestDistance, score: score > prev.bestScore, distanceRank };
  }
}
