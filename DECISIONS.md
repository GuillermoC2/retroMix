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
- **Fecha:** 2026-11-14 · **Estado:** Vigente
- **Contexto:** petición del usuario: el escenario debe subir solo para obligar a no quedarse quieto.
- **Decisión:** `AutoScroll` sube la cámara a velocidad creciente (y sigue al jugador si va por delante). Nunca baja. La lava tiene velocidad propia algo mayor que el avance y nunca queda por debajo del borde inferior de la pantalla (`lava.screenOffset`).
- **Alternativas:** morir al salir de la pantalla por abajo — dos causas de muerte para lo mismo; se prefirió una sola (la lava).
- **Consecuencias:** quedarse quieto al inicio mata en unos 13 s. El borde inferior se calcula con la geometría frontal para que cambiar de cámara no mueva la lava.

## D-012 · Muros neón con degradado animado por shader
- **Fecha:** 2026-11-14 · **Estado:** Vigente
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

## D-015 · Pruebas fuera del repositorio (provisional)
- **Fecha:** 2026-11-13 · **Estado:** En revisión
- **Decisión actual:** el test de conectividad del generador, el fuzzing de movimiento y las capturas con Edge headless + `puppeteer-core` se ejecutaron desde un directorio temporal, sin añadir dependencias al proyecto.
- **Pendiente:** decidir si se incorporan al repo como `npm test` (ver PLAN.md).
