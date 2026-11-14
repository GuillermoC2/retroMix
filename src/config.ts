/**
 * Parámetros ajustables del juego. Todo lo relacionado con dificultad,
 * generación procedural, cámara y render vive aquí para poder afinarlo
 * tras probar sin tocar la lógica.
 *
 * Unidades: 1 casilla del laberinto = 1 unidad de mundo. Velocidades en casillas/segundo.
 */

export const CONFIG = {
  render: {
    /** Altura objetivo del framebuffer interno en píxeles (se reescala con "nearest"). */
    targetPixelHeight: 380,
    minPixelScale: 2,
    maxPixelScale: 5,
    shadows: true,
  },

  maze: {
    /**
     * Posiciones X de los pasillos verticales de la retícula. Entre cada par hay un
     * bloque de pared de 2 casillas. La columna 0 y la última son el borde exterior.
     */
    corridorColumns: [1, 4, 7, 10, 13, 16, 19],
    width: 21,
    /** Filas de bloques que forman cada sección (chunk) generada de una vez. */
    blockRowsPerChunk: 6,
    /** Cuántas casillas por encima del jugador debe existir laberinto generado. */
    generateAhead: 48,
    /** Casillas por debajo de la lava a partir de las cuales se destruye una sección. */
    destroyBelowLava: 14,
    /** Profundidad (eje Z): cuánto sobresalen las paredes del suelo. */
    wallDepth: 1.1,
    /**
     * Color neón del laberinto: todo el laberinto tiene UN color, que va pasando
     * por `colors` con el tiempo. Cada color dura `secondsPerColor` segundos; la
     * fracción final `transition` de ese tiempo es el degradado hacia el siguiente.
     */
    neon: {
      colors: [0x00f0ff, 0x2f6bff, 0x9d3bff, 0xff2bd6, 0xff2f6d, 0xffe62a, 0x39ff6a],
      secondsPerColor: 9,
      transition: 0.45,
    },
    /**
     * Estilos de sección. Cada sección elige uno al azar según `weight`.
     * - mergeChance: probabilidad de cerrar un tramo de pasillo (fusionar bloques).
     * - maxPiece: tamaño máximo (en bloques) de una pieza de pared interior.
     * - maxSpan: anchura máxima (en columnas de bloque) de una pieza interior.
     * - maxBorderPiece: tamaño máximo de una pieza unida al borde exterior.
     * - deadEndChance: probabilidad de aceptar un cierre que crea un callejón sin salida.
     * - tallRowChance: probabilidad de que una fila de bloques mida 3 casillas en vez de 2.
     * - symmetric: refleja la sección izquierda/derecha como los laberintos clásicos.
     */
    styles: [
      { name: 'clasico', weight: 4, symmetric: true, mergeChance: 0.6, maxPiece: 4, maxSpan: 3, maxBorderPiece: 2, deadEndChance: 0.12, tallRowChance: 0.35 },
      { name: 'retorcido', weight: 3, symmetric: false, mergeChance: 0.72, maxPiece: 5, maxSpan: 3, maxBorderPiece: 2, deadEndChance: 0.4, tallRowChance: 0.3 },
      { name: 'abierto', weight: 2, symmetric: false, mergeChance: 0.45, maxPiece: 3, maxSpan: 2, maxBorderPiece: 1, deadEndChance: 0.08, tallRowChance: 0.5 },
      { name: 'galeria', weight: 2, symmetric: true, mergeChance: 0.75, maxPiece: 6, maxSpan: 4, maxBorderPiece: 2, deadEndChance: 0.25, tallRowChance: 0.15 },
    ],
  },

  pellets: {
    dotScore: 10,
    energizerScore: 50,
    /** Energizadores por sección: número mínimo y probabilidad de uno extra. */
    energizersPerChunk: 1,
    extraEnergizerChance: 0.35,
    /** Preferencia por colocarlos al fondo de callejones sin salida (0..1). */
    deadEndPreference: 0.7,
  },

  player: {
    speed: 7.2,
    /** Tolerancia (en casillas) para girar antes/después del centro de una casilla. */
    cornerTolerance: 0.32,
    startColumn: 10,
    startRow: 1,
    deathDuration: 1.6,
  },

  /**
   * Avance automático del escenario: la cámara sube sola aunque el jugador se
   * quede quieto (y le sigue si va por delante). Nunca baja.
   * velocidad = start + (max - start) * (1 - e^(-metros / rampDistance))
   */
  scroll: {
    startSpeed: 0.45,
    maxSpeed: 2.3,
    rampDistance: 500,
  },

  lava: {
    /** La lava empieza este número de casillas por debajo del jugador. */
    startOffset: -7,
    /**
     * Velocidad propia inicial y máxima (casillas/s). La máxima nunca se supera.
     * Algo mayor que el avance del escenario: si el jugador va lento, la lava
     * "entra" en la pantalla desde abajo.
     */
    startSpeed: 0.6,
    maxSpeed: 3.0,
    /** Distancia (metros) a la que la velocidad alcanza ~63% del rango. */
    rampDistance: 450,
    /**
     * Posición "de persecución": estas filas por encima del borde inferior de la
     * pantalla. Si el jugador sube rápido, la lava se queda atrás (fuera de
     * pantalla, sensación de huida) y vuelve hacia esa posición en poco tiempo.
     */
    screenOffset: 2,
    /** Rapidez con que recupera terreno: fracción del hueco cerrada por segundo (exponencial). */
    catchUpRate: 1.65,
    /** Máximo de filas que puede quedar oculta por debajo de la pantalla. */
    maxHidden: 4,
    /** Retraso (s) antes de que la lava empiece a subir por sí misma. */
    startDelay: 1.5,
  },

  ghosts: {
    /** Fantasmas simultáneos según metros recorridos. */
    countByDistance: [
      { from: 0, count: 2 },
      { from: 40, count: 3 },
      { from: 120, count: 4 },
      { from: 250, count: 5 },
      { from: 450, count: 6 },
    ],
    /** Velocidad base (casillas/s) que escala con la distancia hasta `maxSpeed`. */
    baseSpeed: 5.2,
    maxSpeed: 6.9,
    speedRampDistance: 500,
    frightenedSpeed: 3.4,
    eyesSpeed: 14,
    /** Duración del modo asustado: decrece con la distancia hasta `frightMin`. */
    frightMax: 7,
    frightMin: 3.5,
    frightRampDistance: 600,
    frightFlashTime: 2,
    /** Puntuación por fantasmas comidos durante un mismo energizador. */
    eatScores: [200, 400, 800, 1600],
    /** Ciclo dispersión/persecución en segundos. */
    scatterTime: 5,
    chaseTime: 18,
    /** Zona de aparición relativa al jugador (casillas por encima). */
    spawnMinAhead: 17,
    spawnMaxAhead: 28,
    spawnCooldown: 2.5,
    /** Radio de colisión jugador-fantasma. */
    hitRadius: 0.62,
  },

  camera: {
    fov: 34,
    /** Filas visibles aproximadas a la altura del jugador. */
    visibleRows: 25,
    /** Margen lateral en casillas que siempre debe caber en pantalla. */
    sideMargin: 3,
    /** El objetivo de la cámara va adelantado respecto al jugador. */
    lookAhead: 3.5,
    followSharpness: 5,
    transitionSharpness: 5,
    /** Vistas que se recorren con la tecla C (grados). tilt > 0 = cámara por encima del objetivo. */
    views: [
      { name: 'DERECHA', yaw: 19, tilt: 10 },
      { name: 'FRONTAL', yaw: 0, tilt: 0 },
      { name: 'IZQUIERDA', yaw: -19, tilt: 10 },
      { name: 'LATERAL', yaw: 32, tilt: 12 },
    ],
  },

  scoring: {
    metersPerRow: 1,
  },

  powers: {
    /** Romper muro (Espacio): atraviesa en línea recta el muro que hay delante del jugador. */
    wallBreak: {
      /** Cargas al empezar la partida. Cómo se ganan más está por definir (ver PLAN.md). */
      startCharges: 0,
      /** Grosor máximo (casillas) que se puede atravesar de una vez. */
      maxDepth: 4,
      /** Tiempo mínimo entre usos (s). */
      cooldown: 0.25,
      /** Sacudida de cámara al romper (casillas). */
      shake: 0.18,
    },
  },

  /** Ajustes solo para desarrollo/pruebas. Poner a false para el juego normal. */
  dev: {
    infinitePowers: true,
  },
} as const;

export type MazeStyle = (typeof CONFIG.maze.styles)[number];
