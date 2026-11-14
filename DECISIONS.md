# Registro de decisiones

Decisiones de diseño y técnicas del proyecto, con su motivo. Se añade una entrada cada vez que se toma una
decisión no trivial o se revierte una anterior (en ese caso, la antigua se marca como **Sustituida** y se enlaza
la nueva; no se borra).

Formato: `D-NNN · Título` — fecha, estado, contexto, decisión, alternativas descartadas y consecuencias.
Estados: **Vigente** · **Sustituida por D-NNN** · **En revisión**.

---

## D-001 · Stack: Vite + TypeScript + Three.js
- **Fecha:** 2026-11-13 · **Estado:** Vigente
- **Contexto:** Proyecto vacío. Se necesita 3D ligero con estética pixel art y un código modular que crezca con minijuegos.
- **Decisión:** Vite (servidor/empaquetado), TypeScript estricto y Three.js. Única dependencia extra: la fuente *Press Start 2P* vía `@fontsource` (empaquetada, funciona sin conexión).
- **Alternativas:** motor completo (Phaser, Godot, Unity) — más peso y menos control sobre el 2.5D; Canvas 2D — no da volumen real.
- **Consecuencias:** el bundle ronda 580 kB (casi todo Three.js). Aceptado para un juego de una sola página.

## D-002 · Aspecto pixel art mediante render a baja resolución
- **Fecha:** 2026-11-13 · **Estado:** Vigente
- **Decisión:** el framebuffer se dibuja a ~380 px de alto y se escala con `image-rendering: pixelated`; texturas con filtro *nearest* generadas por código. Sin posprocesado.
- **Alternativas:** shader de pixelado en posproceso — más complejo y sin ventaja clara.
- **Consecuencias:** las líneas en perspectiva muestran "dientes de sierra"; se asume como parte de la estética.

## D-003 · Personajes como sprites pixel art extruidos en vóxeles
- **Fecha:** 2026-11-13 · **Estado:** Vigente
- **Decisión:** cada sprite se define como píxeles y se extruye en Z con un perfil de profundidad (`render/voxel.ts`). Las geometrías se cachean por fotograma de animación.
- **Alternativas:** sprites planos (sin volumen) o modelos 3D (demasiado realistas).
- **Consecuencias:** la silueta es pixel art desde el frente y tiene volumen desde los lados.

## D-004 · Arte y nombres originales, mecánicas del género
- **Fecha:** 2026-11-13 · **Estado:** Vigente
- **Decisión:** protagonista, fantasmas y nombre (RetroMix) son diseños propios inspirados en el clásico. No se usan sprites, nombres ni niveles originales de Pac-Man. Las mecánicas (puntos, energizadores, fantasmas) sí se mantienen.
- **Consecuencias:** aplica también a los futuros minijuegos: mecánicas del género sí, recreaciones de juegos concretos no.

## D-005 · Generador de laberinto por retícula + fusión de bloques
- **Fecha:** 2026-11-13 · **Estado:** Vigente
- **Decisión:** los pasillos forman una retícula (columnas fijas `1,4,7,…,19`, filas de bloques de 2–3 casillas) y las paredes son bloques que se fusionan al cerrar tramos. Con conjuntos disjuntos se prohíben los ciclos de pared y la unión de los bordes izquierdo y derecho.
- **Por qué:** garantiza por construcción que todo está conectado y que siempre hay camino hacia arriba, y produce piezas con aspecto arcade (L, T, barras).
- **Ajustes posteriores:** límite de anchura por pieza (`maxSpan`) y al menos un cierre por línea horizontal. Ambos evitan barras y filas abiertas repetitivas.
- **Alternativas:** laberinto perfecto o *braided* clásico — paredes de una casilla y aspecto de "laberinto de papel", no arcade.
- **Verificación:** 300 semillas × 400 filas sin casillas inalcanzables ni zonas abiertas de 2×2.

## D-006 · Lógica separada de la representación
- **Fecha:** 2026-11-13 · **Estado:** Vigente
- **Decisión:** `Maze`, `Player`, `Ghost`, `Lava`, `Pellets`, `GhostDirector` y `AutoScroll` no conocen Three.js. Las vistas los leen o escuchan sus eventos. `MazeRunMode` solo orquesta.
- **Consecuencias:** la lógica se puede probar en Node sin navegador (así se probaron el generador y el movimiento).

## D-007 · Arquitectura para minijuegos: pila de modos + modificadores + eventos
- **Fecha:** 2026-11-13 · **Estado:** Vigente
- **Decisión:** `ModeStack` (push/pop/replace con pause/resume), `RunState.modifiers` (multiplicadores que los sistemas ya aplican), `RunState.events` como disparadores y `Maze.setTile` para alterar el laberinto.
- **Restricción explícita del usuario:** no implementar minijuegos ni interfaces ficticias, y evitar la sobreingeniería.
- **Consecuencias:** cuando llegue la fase 2 puede hacer falta extender el contrato (p. ej. el tipo de resultado). Se decidirá con el primer minijuego real.

## D-008 · Movimiento por casillas con búfer y tolerancia de giro
- **Fecha:** 2026-11-13 · **Estado:** Vigente
- **Decisión:** las entidades se mueven por los ejes de los pasillos. La dirección deseada queda en búfer, invertir el sentido es instantáneo y se puede girar hasta 0,32 casillas antes o después del centro.
- **Verificación:** fuzzing de 120.000 fotogramas sin atravesar paredes ni salir del eje.

## D-009 · IA de fantasmas: objetivos clásicos + BFS
- **Fecha:** 2026-11-13 · **Estado:** Vigente
- **Decisión:** decisión en cada centro de casilla, sin media vuelta salvo en callejones o al cambiar de modo. Hay cuatro personalidades: el perseguidor usa BFS por el camino real y el resto usan objetivo euclídeo como en el clásico. Los ojos vuelven por BFS. No hay "casa": los fantasmas aparecen por encima, fuera de pantalla.
- **Por qué:** el objetivo euclídeo puro se atasca en un laberinto procedural, y el BFS garantiza una amenaza real.
- **Consecuencias:** los fantasmas evitan las casillas de lava y, si caen en ella, mueren.

## D-010 · Presión de la lava con "goma elástica" (`maxGap`)
- **Fecha:** 2026-11-13 · **Estado:** Sustituida por D-011
- La lava recuperaba terreno si el jugador se alejaba más de N filas. No obligaba a moverse si el jugador simplemente esperaba.

## D-011 · El escenario avanza solo y la lava queda atada al borde inferior
- **Fecha:** 2026-11-14 · **Estado:** Vigente el avance automático; la atadura rígida de la lava fue **sustituida por D-020**
- **Contexto:** petición del usuario: el escenario debe subir solo para obligar a no quedarse quieto.
- **Decisión:** `AutoScroll` sube la cámara a velocidad creciente (y sigue al jugador si va por delante). Nunca baja. La lava tiene velocidad propia algo mayor que el avance y nunca queda por debajo del borde inferior de la pantalla (`lava.screenOffset`).
- **Alternativas:** morir al salir de la pantalla por abajo — dos causas de muerte para lo mismo; se prefirió una sola (la lava).
- **Consecuencias:** quedarse quieto al inicio mata en unos 13 s. El borde inferior se calcula con la geometría frontal para que cambiar de cámara no mueva la lava.

## D-012 · Muros neón con degradado animado por shader
- **Fecha:** 2026-11-14 · **Estado:** Vigente la altura de los muros y el uso de máscaras en grises; el degradado por alturas fue **sustituido por D-019**
- **Contexto:** petición del usuario: muros más altos y con color neón en degradado.
- **Decisión:** las texturas de los muros pasan a ser máscaras en grises y `render/neon.ts` inyecta en los materiales Lambert un degradado según la altura que fluye con el tiempo (uniformes compartidos). La paleta incluye un amarillo entre rosa y lima para evitar un marrón en la mezcla. Luz ambiental neutra. `wallDepth` sube a 1,1 y la vista LATERAL baja a 32°.
- **Alternativas:** colores por vértice o regenerar texturas — sin animación barata.

## D-013 · Interfaz en DOM anclada al laberinto
- **Fecha:** 2026-11-13 · **Estado:** Vigente
- **Decisión:** el HUD es HTML/CSS. Los paneles se colocan proyectando los bordes del laberinto a pantalla: los metros a la izquierda y los puntos a la derecha. Los textos van en mayúsculas sin tilde porque la fuente pixel dibuja las mayúsculas acentuadas como minúsculas.
- **Consecuencias:** en pantallas estrechas los paneles pasan arriba.

## D-014 · Récords locales por juego
- **Fecha:** 2026-11-13 · **Estado:** Vigente
- **Decisión:** `localStorage`, con clave por identificador de juego (`maze-run`), preparado para los récords de los futuros minijuegos. Si el almacenamiento no está disponible, funciona en memoria.

## D-016 · Poder "romper muro" en la tecla Espacio
- **Fecha:** 2026-11-14 · **Estado:** Vigente
- **Contexto:** el usuario pidió la tecla D, pero D ya mueve a la derecha (WASD).
- **Decisión (elegida por el usuario):** Espacio. Es accesible tanto con WASD (pulgar) como con flechas (mano izquierda libre). `Input` permite ahora que una tecla dispare varias acciones (Espacio = `confirm` + `power`), y cada modo decide cuál atiende según su estado.
- **Alternativas descartadas:** D rompe y la derecha solo con flecha; D contextual (solo rompería hacia la derecha); tecla E.

## D-017 · El poder atraviesa el muro completo
- **Fecha:** 2026-11-14 · **Estado:** Vigente
- **Contexto:** los muros miden al menos 2 casillas de grosor, así que romper una sola casilla dejaría un hueco ciego.
- **Decisión:** se abre un túnel recto hasta el pasillo del otro lado, con un grosor máximo de `powers.wallBreak.maxDepth` (4). El borde exterior y las filas no generadas son irrompibles. Se rompe hacia la **dirección pulsada si está bloqueada** (para abrir un lateral del pasillo) o, si no, hacia delante. Si falla, sale una "X" roja y no se gasta la carga.
- **Consecuencias:** los fantasmas también pueden usar los túneles nuevos. `Maze.setTiles` avisa también a las secciones vecinas para redibujar los contornos en las fronteras. Evento `wallBroken` disponible para futuros sistemas.

## D-018 · Cargas finitas con interruptor de desarrollo
- **Fecha:** 2026-11-14 · **Estado:** Vigente
- **Decisión:** el poder funciona por cargas (`WallBreaker.charges`, `grant()` para recompensas futuras). `CONFIG.dev.infinitePowers = true` las hace infinitas para pruebas, y el HUD lo indica con "(DEV)". Cómo se ganan cargas en el juego normal está **pendiente de decidir** (PLAN.md).

## D-019 · Un único color neón para todo el laberinto, que cambia con el tiempo
- **Fecha:** 2026-11-14 · **Estado:** Vigente
- **Contexto:** petición del usuario: no quiere varios colores a la vez en el laberinto, sino un solo color que vaya cambiando con un degradado.
- **Decisión:** `NeonCycle` (`render/neon.ts`) calcula un único color por fotograma y lo pasa a los materiales como uniforme. Cada color de la paleta se mantiene y en la parte final (`transition`) funde suavemente al siguiente (`secondsPerColor` = 9 s). Los pedazos al romper un muro usan ese mismo color.
- **Consecuencias:** el shader es más simple (ya no depende de la altura). Sin escalones en la transición: un salto de color de toda la pantalla parpadearía.

## D-020 · La lava se puede dejar atrás, pero vuelve
- **Fecha:** 2026-11-14 · **Estado:** Vigente (sustituye la atadura rígida de D-011)
- **Contexto:** petición del usuario: al subir muy rápido, la lava debe ocultarse un poco (sensación de huida) y volver al poco tiempo.
- **Decisión:** la lava persigue una posición ligada al borde inferior de la pantalla (`screenOffset`) cerrando el hueco de forma exponencial (`catchUpRate`). Nunca queda más de `maxHidden` filas por debajo de esa posición. Su velocidad propia se mantiene.
- **Ajuste (mismo día, feedback del usuario: "se oculta demasiado"):** con `screenOffset` 1,2, `catchUpRate` 0,55 y `maxHidden` 6, al subir la lava topaba con el límite y casi nunca se veía. El retraso al subir es ≈ velocidad / `catchUpRate`. Nuevos valores: `screenOffset` 2,5, `catchUpRate` 2,2, `maxHidden` 3.
- **Segundo ajuste (feedback: "te has pasado, déjalo en un punto intermedio"):** con 2,5 / 2,2 / 3 la lava se veía casi siempre. La media exacta de los parámetros (1,85 / 1,4 / 4,5) no daba un término medio perceptible (la respuesta no es lineal), así que se ajustó midiendo la visibilidad. **Valores actuales:** `screenOffset` 2, `catchUpRate` 1,65, `maxHidden` 4.
- **Medido con los valores actuales** (varía según el laberinto): a ritmo normal se ve ~60–90 % del tiempo, asomando y escondiéndose; con un esprint perfecto se oculta casi siempre, pero solo hasta ~1,8 filas bajo el borde, y vuelve enseguida. Quieto, alcanza al jugador en ~6 s.
- **Cómo afinar:** el retraso al subir ≈ velocidad del jugador / `catchUpRate`. Si ese retraso supera `screenOffset`, la lava sale de pantalla. `maxHidden` limita cuánto se esconde.

## D-021 · Mejora visual del laberinto manteniendo el estilo
- **Fecha:** 2026-11-14 · **Estado:** Vigente (aprobada por el usuario)
- **Decisión:** solo cambia `MazeView`: (1) el contorno de los muros se dibuja como tubo de neón, con un halo tenue a cada lado de la línea; (2) las caras laterales sustituyen la trama de ladrillos por paneles lisos con canto brillante arriba y resplandor en la base; (3) una rejilla tenue del color del laberinto llena el vacío negro de los lados. La generación y la jugabilidad no cambian.

## D-022 · Interfaz "viva" inspirada en las reacciones de Balatro: altura flotante
- **Fecha:** 2026-11-14 · **Estado:** Vigente
- **Contexto:** el usuario quiere la altura fuera del panel azul, más grande, flotando con ritmo y reaccionando a hitos. Indica que la interfaz tomará inspiración de Balatro (movimientos y reacciones a eventos) y que se añadirán más efectos.
- **Decisión:** componente genérico `src/ui/JuicyText.ts` (fuera de `maze-run`, reutilizable por futuros minijuegos). Hace balanceo rítmico con inclinación, ondulación por carácter y reacciones con **muelles amortiguados** (rebotan y se asientan): `pop`, `kick`, `shake`, `flash` y `burst`. Se actualiza por fotograma desde el bucle del juego, no con animaciones CSS, para que los efectos se combinen. Las reglas de cuándo reaccionar viven aparte, en `maze-run/ui/AltitudeDisplay.ts`: micro-pop cada metro, pop cada 10 m y, cada 100 m, crecer un escalón (+8 %, hasta 8 escalones) con pop, giro, temblor, destello y chispas. Los parámetros están en `CONFIG.ui.altitude`.
- **Alcance de la inspiración:** solo la sensación de movimiento y reacción; ni gráficos ni tipografía ni elementos concretos de Balatro (D-004).
- **Consecuencias:** un efecto nuevo es un método en `JuicyText` (cómo) más una regla en `AltitudeDisplay` (cuándo). La cifra crece hacia la izquierda (origen en el lado derecho) y se encoge sola si no cabe junto al laberinto.

## D-023 · Modo dios para desarrollo (tecla K)
- **Fecha:** 2026-11-14 · **Estado:** Vigente
- **Decisión:** con `CONFIG.dev.godModeKey = true`, la tecla K activa o desactiva el modo dios: ni los fantasmas ni la lava matan. Los fantasmas asustados se pueden seguir comiendo. Un indicador rosa parpadeante "MODO DIOS [K]" lo deja claro. Una partida en la que se haya activado **no guarda récords**, para no contaminarlos. El laberinto se sigue destruyendo bajo la lava como siempre, aunque el jugador esté dentro; el usuario prefiere no gastar recursos en ese caso, que nadie va a usar.
- **Consecuencias:** igual que `infinitePowers`, hay que desactivarlo antes de publicar (anotado en PLAN.md).

## D-024 · La cifra de altura pasa a la esquina superior derecha
- **Fecha:** 2026-11-14 · **Estado:** Sustituida por D-025 (la posición; el desplazamiento de la línea del récord sigue vigente)
- **Contexto:** petición del usuario.
- **Decisión:** la cifra se fija a `CONFIG.ui.altitude.margin` px de los bordes superior y derecho, con el origen de escala arriba a la derecha (crece hacia la izquierda y hacia abajo). Se encoge sola si no cabe a la derecha del laberinto, midiendo el borde del laberinto en lo alto de la pantalla, donde la perspectiva lo hace más ancho. La línea del récord se desplaza con el crecimiento. En pantallas verticales el panel de puntos pasa a la izquierda para dejarle la esquina.

## D-025 · Altura centrada sobre el panel de puntos y crecimiento más contenido
- **Fecha:** 2026-11-14 · **Estado:** Vigente
- **Contexto:** feedback del usuario: la cifra crecía demasiado y quería verla más centrada, entre el panel de puntos y lo alto de la pantalla.
- **Decisión:** la cifra se centra horizontalmente sobre el panel de puntos y, en vertical, a medio camino entre el borde superior y el panel, con el origen de escala en el centro. Si no cabe centrada sin acercarse al laberinto, se desplaza a la derecha y, como último recurso, se encoge. Crecimiento: +4 % por hito, como máximo 6 hitos (+24 % en total; antes, +8 % y 8 hitos, +64 %).

## D-015 · Pruebas fuera del repositorio (provisional)
- **Fecha:** 2026-11-13 · **Estado:** En revisión
- **Decisión actual:** el test de conectividad del generador, el fuzzing de movimiento y las capturas con Edge headless + `puppeteer-core` se ejecutaron desde un directorio temporal, sin añadir dependencias al proyecto.
- **Pendiente:** decidir si se incorporan al repo como `npm test` (ver PLAN.md).
