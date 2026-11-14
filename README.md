# RetroMix — Fase 1: laberinto infinito

Arcade retro 2.5D: sube por un laberinto vertical infinito generado proceduralmente, come puntos,
esquiva fantasmas y escapa de la lava que asciende. El objetivo es llegar lo más alto posible (metros).

> Seguimiento del proyecto: [PLAN.md](PLAN.md) (qué está hecho y qué sigue) · [DECISIONS.md](DECISIONS.md) (por qué se hizo así).

## Ejecutar

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # comprobación de tipos + build de producción en dist/
```

## Controles

| Tecla | Acción |
| --- | --- |
| WASD / flechas | Mover (la dirección queda en búfer hasta que se pueda girar) |
| Espacio | Romper el muro de delante (o el de la dirección pulsada si está bloqueada) |
| C | Cambiar perspectiva: derecha → frontal → izquierda → lateral |
| Enter / Espacio | Reiniciar tras el Game Over |

## Tecnología

Vite + TypeScript + Three.js. Sin más dependencias (más la fuente *Press Start 2P*, empaquetada localmente).
El aspecto pixel art se consigue renderizando a baja resolución (~380 px de alto) y escalando con
`image-rendering: pixelated`; personajes y puntos son figuras voxel generadas a partir de sprites pixel art.

## Estructura

```
src/
  config.ts                 ← TODOS los parámetros ajustables (dificultad, generación, cámara, render)
  main.ts                   ← arranque
  core/                     ← independiente de cualquier juego concreto
    Game.ts                 bucle principal y servicios compartidos (GameContext)
    ModeStack.ts            pila de modos: push / pop / replace (+ pause/resume)
    Input.ts                teclado → acciones abstractas
    Events.ts               emisor de eventos tipado
    Records.ts              récords en localStorage, por juego
    Rng.ts                  aleatorio con semilla
  render/                   ← utilidades gráficas reutilizables
    PixelRenderer.ts        render a baja resolución
    neon.ts                 color neón único que cambia con el tiempo
    voxel.ts                sprite pixel art → geometría voxel 2.5D
    pixelTextures.ts        texturas generadas por código
  maze-run/                 ← el juego del laberinto
    MazeRunMode.ts          orquesta los sistemas y las reglas que los relacionan
    CameraRig.ts            seguimiento, perspectivas y luz/sombras
    maze/                   generación (MazeGenerator), datos (Maze), vista (MazeView), BFS (DistanceField)
    entities/               jugador y fantasmas: lógica y vista separadas, sprites
    systems/                avance automático, puntos, lava, director de fantasmas, estado, curvas de dificultad
    ui/                     HUD, popups de puntuación, Game Over
```

Lógica y representación están separadas: `Maze`, `Player`, `Ghost`, `Lava`, `Pellets`… no saben nada de
Three.js; sus vistas (`MazeView`, `PlayerView`, `GhostsView`, `LavaView`, `PelletsView`) los leen o escuchan sus eventos.

## Generación del laberinto

Los pasillos forman una retícula (columnas fijas, filas de bloques de 2–3 casillas). Las paredes son bloques
que se fusionan en piezas (L, T, barras…) al cerrar tramos de pasillo, como en los laberintos arcade.
Un conjunto disjunto impide cerrar un tramo si eso formara un ciclo de paredes o uniera el borde izquierdo con
el derecho, así que **todos los pasillos están conectados y siempre hay camino hacia arriba** (verificado sobre
300 semillas). Cada sección elige un estilo (`clasico` simétrico, `retorcido`, `abierto`, `galeria`) definido en
`config.ts`. Las secciones se crean por arriba y se destruyen bajo la lava.

## Dificultad (todo en `config.ts`)

Todas las curvas siguen `start + (max − start) · (1 − e^(−metros / rampDistance))`, con tope `max`.

- **Avance del escenario** (`scroll`): la cámara sube sola aunque el jugador no se mueva, y le sigue si va
  por delante. Nunca baja (`systems/AutoScroll.ts`).
- **Lava** (`lava`): sube con velocidad propia y persigue el borde inferior de la pantalla (`screenOffset`). Si el
  jugador sube muy rápido se queda atrás y se oculta (hasta `maxHidden` filas), pero recupera terreno en pocos
  segundos (`catchUpRate`). Quedarse quieto o retroceder lleva a la lava.
- **Fantasmas**: cantidad por tramos de distancia (`countByDistance`), velocidad creciente con tope,
  duración del susto decreciente. Personalidades en `entities/Ghost.ts` (`PERSONALITIES`).

## Poder: romper muro

`systems/WallBreaker.ts` abre un túnel recto a través de todo el grosor del muro (máx. `powers.wallBreak.maxDepth`).
El borde exterior es irrompible. La animación de pedazos está en `effects/ShatterEffect.ts`. Funciona por cargas, y
`dev.infinitePowers` las hace infinitas para pruebas.

## Estética neón

Las texturas de los muros son máscaras en escala de grises. El color lo pone `render/neon.ts`: todo el laberinto tiene
un único color neón que se mantiene unos segundos y funde al siguiente de la paleta. Paleta, duración de cada color y
duración del fundido en `maze.neon`. La altura de los muros es `maze.wallDepth`.

## Preparado para minijuegos (aún no implementados)

- **Pausar el laberinto y volver**: un minijuego será otro `GameMode`. El laberinto lo apila con
  `ctx.modes.push(minijuego)` (recibe `pause()`); el minijuego entrega su resultado con un callback y hace
  `ctx.modes.pop()`; el laberinto recibe `resume()`.
- **Disparadores**: `RunState.events` emite `meters`, `score`, `energizer` y `died`; un futuro sistema de
  desafíos puede escucharlos (p. ej. “cada 100 m”).
- **Efectos del resultado**:
  - `RunState.modifiers` (`playerSpeed`, `ghostSpeed`, `lavaSpeed`, `scrollSpeed`): multiplicadores que ya aplican los sistemas.
  - `Maze.setTile()` modifica el laberinto y la vista reconstruye la sección afectada.
  - `GhostDirector` (asustar, añadir o retirar fantasmas) y `Lava` (su nivel `y`) son accesibles desde el modo.
- **Récords** separados por juego (`Records.get(id)`).
