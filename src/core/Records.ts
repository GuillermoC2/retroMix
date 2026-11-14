const KEY = 'retromix.records.v1';

export interface RecordEntry {
  bestDistance: number;
  bestScore: number;
}

/** Récords persistidos en localStorage. Si el almacenamiento no está disponible, funciona solo en memoria. */
export class Records {
  private data: Record<string, RecordEntry> = {};

  constructor() {
    try {
      this.data = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    } catch {
      this.data = {};
    }
  }

  get(game: string): RecordEntry {
    return this.data[game] ?? { bestDistance: 0, bestScore: 0 };
  }

  /** Registra un resultado y devuelve qué récords se han batido. */
  submit(game: string, distance: number, score: number): { distance: boolean; score: boolean } {
    const prev = this.get(game);
    const beat = { distance: distance > prev.bestDistance, score: score > prev.bestScore };
    this.data[game] = {
      bestDistance: Math.max(prev.bestDistance, distance),
      bestScore: Math.max(prev.bestScore, score),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* almacenamiento no disponible: se mantiene en memoria */
    }
    return beat;
  }
}
