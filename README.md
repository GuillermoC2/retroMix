# RetroMix — laberinto infinito con portales a minijuegos

Arcade retro 2.5D: sube por un laberinto vertical infinito generado proceduralmente, come puntos,
esquiva fantasmas y escapa de la lava que asciende. El objetivo es llegar lo más alto posible (metros).

> Seguimiento del proyecto: [PLAN.md](PLAN.md) (qué está hecho y qué sigue) · [DECISIONS.md](DECISIONS.md) (por qué se hizo así).

Solo para ordenador con teclado: en pantallas de móvil (o ventanas pequeñas o verticales) se muestra un aviso
y el juego se detiene.

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
| Z | ROMPEMUROS: romper el muro de delante (o el de la dirección pulsada si está bloqueada). Con un poder especial no rompe muros: hace la acción del poder (FUEGO HIELO: rastro de hielo) o nada |
| X | Acción: hace la acción disponible en cada momento (el dash de DASH tras coger una pluma; la llamarada de FUEGO HIELO) |
| W/S o ↑/↓ | Mover la pala en el Pong |
| ← → · ↑/X · Z · ↓ · Espacio | BLOQUES: mover, girar, girar al revés, bajar rápido, soltar |
| C | Cambiar perspectiva: derecha → frontal → izquierda → lateral |
| Enter / Espacio | Reiniciar tras el Game Over |
| ←/→, Enter, 1–3, Esc | En la tienda de habilidades: elegir, comprar, comprar directamente, salir sin comprar (también con el ratón) |
| K | *(desarrollo)* Menú de modo dios (pausa): trucos (invencible, romper muro infinito, saltar minijuegos: no / ganar / perder) con 1–9 o clic; con clic, teletransporte (siguiente portal, siguiente muro portal, +100/+500/+1000 m), poderes especiales (cierra el menú y lanza el poder) y sumar 10.000 puntos; K o Esc cierran. Requiere `CONFIG.dev.godMenuKey`; los trucos se recuerdan entre recargas y una partida con trucos no guarda récords |

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
  ui/                       ← componentes de interfaz reutilizables
    JuicyText.ts            texto flotante con reacciones (pop, giro, temblor, destello, chispas)
    PopWindow.ts            ventana animada estilo Balatro (minijuegos y Game Over)
    PixelFire.ts            fuego pixel art que arde desde un texto
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
El borde exterior es irrompible. La animación de pedazos está en `effects/ShatterEffect.ts`. Funciona por usos.
En el HUD se llama **ROMPEMUROS**, con los usos que quedan en grande a la derecha. Se empieza con 2 y cada portal o
muro portal superado da uno más (`powers.wallBreak.startCharges` y `perPortal`); el menú de modo dios (K) permite romper
sin gastar usos.

## Estética neón

Las texturas de los muros son máscaras en escala de grises. El color lo pone `render/neon.ts`: todo el laberinto tiene
un único color neón que se mantiene unos segundos y funde al siguiente de la paleta. Paleta, duración de cada color y
duración del fundido en `maze.neon`. La altura de los muros es `maze.wallDepth`.

## Portales y minijuegos

Antes del primer muro portal y luego en uno de cada dos tramos entre muros (`CONFIG.portals`; a veces también en los
demás) el generador abre, hacia la mitad del tramo, una sala de 13 × 9 casillas con un
portal en el centro. Pisarlo absorbe al jugador y abre un minijuego en una ventana sobre el laberinto pausado.
Ganar activa un poder especial aleatorio; perder acaba la partida.

- **Añadir un minijuego:** crear un `GameMode` con `overlay = true` que al terminar haga `ctx.modes.pop()` y llame
  a `done({ won })`, y registrarlo en `src/minigames/registry.ts`. El portal elige uno al azar. `stakes.kind` dice
  desde dónde se entra (`gate` muro portal, `portal` portal de poder especial, más difícil) y `PopWindow` da la
  ventana animada (entrada, flotación, golpes y salida).
- **Pong** (`src/minigames/pong/`): lógica en `PongGame`, pista 2.5D en `PongScene` (Three.js, su propio renderer),
  temas en `themes.ts` y teclado y avisos en `PongMode`. Parámetros en `CONFIG.minigames.pong`.
- **BLOQUES** (`src/minigames/blocks/`): piezas de 4 bloques que caen. Lógica en `BlocksGame`, pozo 2.5D en `BlocksScene`,
  temas en `themes.ts` y teclado y avisos en `BlocksMode`. Parámetros en `CONFIG.minigames.blocks`.
  Teclas: ← → mover, ↑ o X girar, Z girar al revés, ↓ bajar rápido, Espacio soltar.
- **Común:** `MinigameFrame` (ventana animada, título, avisos con fuego, cierre) y `scene3d` (muelles, cifras de vóxeles,
  partículas, encuadre de cámara, liberar la GPU).
- **Poderes especiales** (`systems/SpecialPowers.ts`, `CONFIG.specialPowers`): se elige uno de `pool`.
  **GIGANTE**: ×6 de tamaño, más rápido, come muros, fantasmas y puntos durante 8 s.
  **GHOUL**: ×2,6, gris con el ojo rojo, 10 s caminando sobre 4 tentáculos de vóxeles por encima de los muros; rompe los bloques que pisa y pisotea fantasmas
  (`systems/GhoulLegs.ts`, `effects/TentacleView.ts`).
  **FUEGO HIELO**: ×1,35, mitad de hielo y mitad en llamas, 20 s. Z dispara una cuña de hielo en rampa que come puntos,
  mata fantasmas y sobre la que se desliza más rápido, también por encima de los muros que cubre; X lanza una
  llamarada que quema bloques, fantasmas y puntos (ambas cada 0,5 s)
  (`systems/FireIce.ts`, `effects/FireIceView.ts`, `effects/ElementParticles.ts`).
  Las reglas de cada poder se aplican en `MazeRunMode`. Con un poder activo no se cogen objetos de habilidad, no se
  usa ROMPEMUROS y, al recibirlo, se cortan los efectos de habilidad en curso (láser, dash, imán y congelación).
- **Cinemática de poder** (`effects/PowerCinematic.ts`): al recibir un poder, el protagonista vuela hacia la cámara, hace
  el acto del poder (GIGANTE: come una cereza y crece en 3 escalones) y cae de golpe dejando humo. Un poder nuevo
  necesita su acto en `ACTS`. Tiempos en `CONFIG.specialPowers.cinematic` y en el `intro` de cada poder.
- **Muros portal** (`systems/Gates.ts`, `systems/GatesView.ts`, `CONFIG.gates`): cada 100–150 m (+20 m por muro) una barrera de lado a lado
  (`Tile.Gate`) que nada atraviesa. Al empujarla desde la línea de debajo se entra en su minijuego (nombre en un cartel
  sobre el muro). Ganar abre la tienda y luego el muro; perder abre la tienda bloqueada (no se puede escoger
  habilidad) y luego el muro, sin acabar la partida.
- **Habilidades** (`abilities/catalog.ts`, `systems/Abilities.ts`, `ui/AbilityShopMode.ts`, `CONFIG.abilities`): permanentes,
  de tres niveles (básica 2.500, épica 5.000, legendaria 10.000 puntos). La tienda ofrece una por nivel. Cada una se
  compra una vez por partida, salvo las que tienen `maxLevel` (mejoras "+": SUSTO LARGO +). **Añadir una habilidad:**
  una entrada en `ABILITIES` (nivel, textos, icono pixel art, `maxLevel` opcional y `effects`) y aplicar su efecto donde
  toque leyendo `Abilities` (p. ej. `frightBonus` de SUSTO LARGO o `pickup` de HIELO y LASER).
  - SUSTO LARGO (básica, hasta 2 niveles): +2 s de susto por nivel.
  - HIELO (épica): cubitos de hielo cada 70 m; al coger uno, los fantasmas se congelan 5 s (no matan, se pueden comer).
  - LASER (legendaria, hasta 2 niveles): bolas naranjas cada 80 m; al comer una, láser por la boca 5 s (+3 s con LASER +)
    que se come a los fantasmas (`systems/Laser.ts`, `LaserView.ts`).
  - DASH (épica): plumas cada 90 m; al coger una, 10 s azulado en los que X hace un dash (≈ 6 casillas, recarga 1 s)
    que mata a los fantasmas que toca (`systems/Dash.ts`, `effects/DashTrail.ts`).
  - IMAN (básica, hasta 2 niveles): imanes cada 75 m; al coger uno, durante 5 s (+5 s con IMAN +) los puntos pequeños a
    menos de 3,5 casillas vuelan hacia el protagonista (`systems/Magnet.ts`, `effects/MagnetEffect.ts`).
  - Los objetos que siembran las habilidades (`effects.pickup`) los gestiona `systems/Pickups.ts`.
- **Otros enganches:** `RunState.events` (`meters`, `score`, `energizer`, `died`, `portalEntered`, `minigameResult`,
  `specialPower`, `gateEntered`, `abilityBought`, `ghostsFrozen`, `laserFired`, `dash`…), `RunState.modifiers` (multiplicadores de velocidad), `Maze.setTiles()` y récords por juego (`Records.get(id)`).

```
src/minigames/
  types.ts        contrato: MinigameDef, MinigameStakes (kind) y MinigameResult
  registry.ts     minijuegos disponibles en los portales
  MinigameFrame.ts  ventana común: marco, título, avisos (con fuego) y cierre
  scene3d.ts      piezas 3D comunes: muelles, cifras de vóxeles, partículas, encuadre
  blocks/         BlocksGame (lógica), BlocksScene (pozo 2.5D), themes y BlocksMode (teclado, avisos)
  pong/           PongGame (lógica), PongScene (pista 2.5D), themes (muro / portal) y PongMode (ventana, textos, teclado)
```
