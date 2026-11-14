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

  ui: {
    /**
     * Pantallas donde no se puede jugar (móviles, ventanas pequeñas o verticales):
     * se muestra un aviso y el juego se detiene. Consulta CSS media query.
     */
    unsupportedScreen: '(max-width: 760px), (max-height: 480px), (max-aspect-ratio: 1/1)',
    /**
     * Columna del HUD a la derecha del laberinto: los elementos se centran entre el
     * borde derecho del laberinto y el de la pantalla.
     */
    layout: {
      /** Separación mínima (px) a cada lado de la columna (laberinto y borde de pantalla). */
      padding: 24,
      /** Distancia mínima (px) al borde superior. */
      margin: 28,
    },
    /** Cifra de altura flotante (estilo de reacciones inspirado en Balatro). */
    altitude: {
      /** Altura del centro de la cifra en pantalla (fracción desde arriba). */
      screenY: 0.15,
      fontSize: 60,
      /** Balanceo lateral rítmico: amplitud (px), periodo (s) e inclinación (grados). */
      swayAmplitude: 9,
      swayPeriod: 2.8,
      tiltAmplitude: 3.5,
      /** Ondulación vertical de cada dígito (px). */
      waveAmplitude: 2.5,
      /** Cada cuántos metros hay un hito (crece y reacciona con fuerza). */
      milestone: 100,
      /** Crecimiento por hito y número máximo de escalones. */
      growthPerMilestone: 0.04,
      maxGrowthSteps: 6,
      /** Cada cuántos metros hay un pop pequeño. */
      smallPopEvery: 10,
    },
    /** Lista de récords de distancia a la izquierda del laberinto (D-040). */
    records: {
      /** Borde superior de la lista en pantalla (fracción desde arriba). */
      screenY: 0.07,
      /** Altura máxima de la lista (fracción de la pantalla); si no cabe, se encoge. */
      maxHeight: 0.86,
      /** Tamaño de las cifras: casi como la altura de la partida (60). */
      fontSize: 48,
      swayAmplitude: 5,
      swayPeriod: 3.1,
      tiltAmplitude: 2,
      waveAmplitude: 2,
    },
    /** Puntuación flotante: cuenta hacia arriba y reacciona según lo ganado. */
    score: {
      /** Separación (px) entre la línea del récord de altura y los puntos, que van justo debajo. */
      gapBelowAltitude: 26,
      fontSize: 34,
      swayAmplitude: 6,
      swayPeriod: 3.4,
      tiltAmplitude: 2.5,
      waveAmplitude: 1.5,
      /** Rapidez del recuento hacia la cifra real (fracción del hueco por segundo, exponencial). */
      tallyRate: 9,
      /** Ganancias a partir de las cuales la reacción es media (energizador) o grande (fantasma). */
      mediumGain: 50,
      bigGain: 200,
    },
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

  /**
   * Portales a minijuegos: cada cierta distancia el laberinto abre una sala amplia
   * con un portal en el centro. Se puede esquivar o entrar pisándolo.
   */
  portals: {
    /** Metros a los que aparece la primera sala y separación entre salas. */
    firstAt: 60,
    every: 150,
    /** Columnas de pasillo (índices de `maze.corridorColumns`) entre las que se abre la sala. */
    plazaColumns: [1, 5],
    /** Distancia (casillas) al centro del portal para entrar. */
    enterRadius: 0.45,
    /** Duración (s) de la absorción por el portal antes de abrir el minijuego. */
    absorbTime: 0.6,
  },

  /**
   * Poderes especiales que se ganan al vencer un minijuego. Se elige uno al azar
   * de `pool` y se activa automáticamente.
   */
  specialPowers: {
    pool: ['giant', 'ghoul'],
    /**
     * Cinemática al recibir un poder: el protagonista sale volando hacia la cámara,
     * hace la acción propia del poder y cae de golpe a su sitio dejando humo. La
     * partida queda congelada mientras tanto; el tiempo del poder empieza al aterrizar.
     */
    cinematic: {
      /** Subida hacia la cámara (s). */
      riseTime: 0.7,
      /** Fracción de la altura de pantalla que ocupa al llegar arriba. */
      closeUpSize: 0.42,
      /** Caída (s), y asentamiento tras el golpe (s). */
      fallTime: 0.3,
      /**
       * Vueltas durante la subida y la caída: `disc` sobre su propio eje (como un
       * disco) y `flip` sobre el eje vertical (como una moneda: se le ve el canto).
       */
      riseTurns: { disc: 1, flip: 1 },
      fallTurns: { disc: 1, flip: 1 },
      settleTime: 0.3,
      /** Sacudida de cámara al aterrizar y número de bocanadas de humo. */
      impactShake: 0.6,
      smokePuffs: 40,
    },
    giant: {
      name: 'GIGANTE',
      /** El cambio de color habitual de las paredes va este número de veces más rápido. */
      neonSpeed: 5,
      /** Duración (s), tamaño (×) y multiplicador de velocidad. */
      duration: 8,
      scale: 6,
      speed: 1.3,
      /** Últimos segundos en los que parpadea para avisar de que se acaba. */
      warnTime: 1.2,
      /** Duración (s) de la animación de salida (encoger). */
      outroTime: 0.35,
      /**
       * Acción de la cinemática: la cereza entra volando (`cherryTime`), se la come
       * (`chompTime`) y crece en `growSteps` escalones separados `stepEvery` s,
       * hasta ocupar `closeUpEndSize` de la pantalla; luego espera `hold` s.
       */
      intro: { cherryTime: 0.45, chompTime: 0.35, growSteps: 3, stepEvery: 0.35, closeUpEndSize: 0.72, hold: 0.3 },
      /** Media anchura (casillas) de lo que come alrededor de su centro (2,9 ≈ 6×6 casillas). */
      reach: 2.9,
      /** Sacudida de cámara al comerse muros. */
      shake: 0.08,
    },
    /**
     * GHOUL: le salen 4 tentáculos rojos con los que camina por encima de los muros.
     * Los bloques que pisa un tentáculo se rompen y los fantasmas cercanos son
     * pisoteados. Puede ir por encima de cualquier casilla salvo el borde exterior.
     */
    ghoul: {
      name: 'GHOUL',
      /** Paredes en alerta: parpadeo rápido entre un rojo muy apagado y uno intenso (periodo s, fracción intensa). */
      wallAlert: { dim: 0x2a0006, bright: 0xff1a2c, period: 0.4, duty: 0.45 },
      duration: 10,
      /** Tamaño (×, casi como el GIGANTE original) y multiplicador de velocidad. */
      scale: 2.6,
      speed: 1.2,
      warnTime: 1.5,
      /** Duración (s) de la salida: recoge los tentáculos, encoge y baja al suelo. */
      outroTime: 0.45,
      /** Altura extra (casillas) del cuerpo: va por encima de los muros. */
      lift: 1.05,
      /** Posición de reposo de cada pie respecto al cuerpo (casillas, ±x, ±y). */
      footOffset: [2.4, 2.0],
      /** Distancia a su reposo a partir de la cual un pie da un paso, duración (s) y altura del paso. */
      stride: 1.5,
      stepTime: 0.14,
      stepHeight: 1.4,
      /** Cuánto adelanta el pie según la velocidad (s): más adelanto, menos se quedan atrás. */
      stepLead: 0.22,
      /** Grosor de los tentáculos en la base y en la punta (radio, casillas). */
      thickness: [0.36, 0.09],
      /** Fantasmas a menos de esta distancia del cuerpo reciben un pisotón (rápido, `stompTime` s). */
      stompRange: 3.8,
      stompTime: 0.13,
      /** Radio (casillas) del pisotón alrededor de la punta del tentáculo. */
      stompRadius: 1.3,
      /** Sacudida de cámara por paso que rompe un bloque. */
      shake: 0.07,
      /** Cuánto se retuercen los tentáculos (casillas, a escala ×1): ondas de varias frecuencias. */
      writhe: 0.22,
      /** Al acabar, cae y rompe los bloques a menos de esta distancia (casillas) de su centro. */
      landBreakRadius: 1.6,
      /**
       * Acto de la cinemática: se oscurece parpadeando (`darkenTime`), crece de golpe
       * (`growTime`) hasta ocupar `closeUpEndSize` de la pantalla, le brotan los
       * tentáculos uno a uno (`tentacleEvery`, cada uno crece en `tentacleGrow`) y
       * espera `hold` s.
       */
      intro: { darkenTime: 0.5, growTime: 0.3, closeUpEndSize: 0.55, tentacleEvery: 0.22, tentacleGrow: 0.2, hold: 0.5 },
    },
  },

  minigames: {
    pong: {
      /** Puntos para ganar la partida. */
      pointsToWin: 3,
      /** Campo en píxeles lógicos (se escala en pantalla sin suavizado). */
      width: 160,
      height: 120,
      paddleHeight: 22,
      paddleSpeed: 120,
      /** Velocidad de la bola: inicial, aumento por golpe (×) y máxima (px/s). */
      ballSpeed: 90,
      ballSpeedUp: 1.07,
      ballMaxSpeed: 200,
      /** Ángulo máximo de rebote en la pala (grados), según dónde golpee. */
      maxBounceAngle: 55,
      /**
       * Rival: velocidad máxima (px/s), parte del campo (0..1) que debe cruzar la bola
       * antes de que reaccione, y error de puntería (px) a la velocidad inicial de la
       * bola. El error se elige en cada golpe y crece en proporción a la velocidad.
       */
      aiSpeed: 72,
      aiReactFrom: 0.4,
      aiError: 11,
      /** Cuenta atrás antes de empezar (s) y pausa tras cada punto (s). */
      countdown: 3,
      pointPause: 0.9,
      /** Tiempo (s) que se muestra el resultado antes de volver al laberinto. */
      resultTime: 2.4,
    },
  },

  /** Ajustes solo para desarrollo/pruebas. Poner a false para el juego normal. */
  dev: {
    /**
     * La tecla K abre el menú de modo dios (pausa la partida): invencibilidad,
     * romper muro infinito y activar/desactivar poderes especiales.
     */
    godMenuKey: true,
  },
} as const;

export type MazeStyle = (typeof CONFIG.maze.styles)[number];
export type SpecialPowerId = (typeof CONFIG.specialPowers.pool)[number];
