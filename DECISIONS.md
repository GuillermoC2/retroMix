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
- **Fecha:** 2026-11-13 · **Estado:** Vigente (la disposición de los paneles la sustituye D-027; lo de pantallas estrechas, D-026)
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
- **Fecha:** 2026-11-14 · **Estado:** Vigente las cargas; el interruptor `dev.infinitePowers` lo sustituye D-032
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
- **Fecha:** 2026-11-14 · **Estado:** Sustituida por D-032 (la regla de no guardar récords sigue vigente)
- **Decisión:** con `CONFIG.dev.godModeKey = true`, la tecla K activa o desactiva el modo dios: ni los fantasmas ni la lava matan. Los fantasmas asustados se pueden seguir comiendo. Un indicador rosa parpadeante "MODO DIOS [K]" lo deja claro. Una partida en la que se haya activado **no guarda récords**, para no contaminarlos. El laberinto se sigue destruyendo bajo la lava como siempre, aunque el jugador esté dentro; el usuario prefiere no gastar recursos en ese caso, que nadie va a usar.
- **Consecuencias:** igual que `infinitePowers`, hay que desactivarlo antes de publicar (anotado en PLAN.md).

## D-024 · La cifra de altura pasa a la esquina superior derecha
- **Fecha:** 2026-11-14 · **Estado:** Sustituida por D-025 (la posición; el desplazamiento de la línea del récord sigue vigente)
- **Contexto:** petición del usuario.
- **Decisión:** la cifra se fija a `CONFIG.ui.altitude.margin` px de los bordes superior y derecho, con el origen de escala arriba a la derecha (crece hacia la izquierda y hacia abajo). Se encoge sola si no cabe a la derecha del laberinto, midiendo el borde del laberinto en lo alto de la pantalla, donde la perspectiva lo hace más ancho. La línea del récord se desplaza con el crecimiento. En pantallas verticales el panel de puntos pasa a la izquierda para dejarle la esquina.

## D-025 · Altura centrada sobre el panel de puntos y crecimiento más contenido
- **Fecha:** 2026-11-14 · **Estado:** Vigente el crecimiento; la posición la sustituye D-027
- **Contexto:** feedback del usuario: la cifra crecía demasiado y quería verla más centrada, entre el panel de puntos y lo alto de la pantalla.
- **Decisión:** la cifra se centra horizontalmente sobre el panel de puntos y, en vertical, a medio camino entre el borde superior y el panel, con el origen de escala en el centro. Si no cabe centrada sin acercarse al laberinto, se desplaza a la derecha y, como último recurso, se encoge. Crecimiento: +4 % por hito, como máximo 6 hitos (+24 % en total; antes, +8 % y 8 hitos, +64 %).

## D-026 · Solo escritorio: aviso en pantallas de móvil
- **Fecha:** 2026-11-14 · **Estado:** Vigente
- **Contexto:** el usuario indica que la interfaz no está pensada para móviles y que no hay que esforzarse en ello; basta con un mensaje claro.
- **Decisión:** si la pantalla cumple `CONFIG.ui.unsupportedScreen` (ancho ≤ 760 px, alto ≤ 480 px o más alta que ancha), se muestra a pantalla completa "NO SE PUEDE JUGAR EN MOVIL" y el bucle del juego se detiene (`Game.suspended`), así no se pierde la partida si se achica la ventana del ordenador. Al volver a un tamaño válido, sigue donde estaba. Se elimina todo el código de adaptación a pantallas estrechas.
- **Consecuencias:** se descarta la propuesta de controles táctiles.

## D-027 · Interfaz sin cajas en una columna a la derecha del laberinto
- **Fecha:** 2026-11-14 · **Estado:** Vigente
- **Contexto:** el usuario pide la altura centrada entre el laberinto y el borde derecho de la pantalla, los puntos fuera de su caja con reacciones al estilo Balatro (como la altura, D-022) y, abajo a la derecha, "C CAMBIAR VISTA" con un icono de tecla pixelado.
- **Decisión:** desaparece el panel azul. Todo el HUD se centra en la columna que va del borde derecho del laberinto (el punto más a la derecha de su altura visible, por la perspectiva) al borde de la pantalla: altura arriba (`CONFIG.ui.altitude.screenY` = 0,15), puntos justo debajo de la altura (`CONFIG.ui.score.gapBelowAltitude`; a petición del usuario, que avisa de que puede cambiar) y ayudas abajo.
  - **Puntos** (`ScoreDisplay`, con `JuicyText`): la cifra cuenta hacia arriba hasta el valor real (`tallyRate`) en lugar de saltar. Reacciona según lo ganado de golpe: micro-pop por punto, pop y giro por energizador, y pop, giro, temblor, destello cian y chispas por fantasma. Se usan blanco y cian para no confundirse con el amarillo de la altura. Parámetros en `CONFIG.ui.score`.
  - **Ayudas** con icono de tecla en CSS (contorno de esquinas recortadas, bisel y canto inferior). La tecla se hunde al pulsarla. También pasa a ser una ayuda de este tipo el poder de romper muro ("ESPACIO ROMPER MURO" con las cargas debajo), que estaba en el panel. Se deja de mostrar el nombre de la vista actual, como pidió el usuario ("simplemente C Cambiar vista").
  - Si la columna es estrecha, las ayudas ponen el texto bajo la tecla, y las cifras y las ayudas se encogen como último recurso.

## D-028 · Salas con portal cada N metros
- **Fecha:** 2026-11-14 · **Estado:** Vigente
- **Contexto:** petición del usuario: cada cierta distancia, una zona más amplia con un portal central que se pueda esquivar con facilidad o tomar si se quiere.
- **Decisión:** el generador vacía dos filas de bloques (forzadas a 3 casillas de alto) y sus tres líneas entre la 2.ª y la 6.ª columna de pasillo: una sala de 13 × 9 casillas con el portal en el centro exacto (x = 10). Primera sala a los `portals.firstAt` = 60 m y luego cada `portals.every` = 150 m. La sala solo abre casillas, así que la conectividad garantizada (D-005) se mantiene (verificado en 300 semillas, 2.400 salas). Los pasillos de los bordes siguen igual, así que se puede rodear; y dentro, el portal ocupa 1 casilla de 117, así que esquivarlo es fácil. Sin energizadores dentro de la sala ni punto en la casilla del portal.
- **Entrar:** pisar el centro (`enterRadius` 0,45). El jugador es absorbido (va al centro girando y encogiendo, `absorbTime` 0,6 s) y se abre el minijuego. El portal se cierra tras usarlo.
- **Aspecto:** remolino en espiral pixelado, anillo octogonal que recorre el arcoíris (para distinguirlo del color único del laberinto, D-019), marca en el suelo, partículas voxel y un cartel con el nombre del juego ("PONG / PORTAL"). Una sola luz compartida para no variar el número de luces de la escena (recompilaría materiales).

## D-029 · Minijuegos como modos superpuestos, con un contrato mínimo
- **Fecha:** 2026-11-14 · **Estado:** Vigente (cierra el "contrato mínimo" previsto en D-007)
- **Decisión:** un minijuego es un `MinigameDef` (`id`, `name`, `create(ctx, done)`) en `src/minigames/registry.ts`; el portal elige uno al azar al aparecer (para poder anunciarlo). `create` devuelve un `GameMode` con `overlay = true`: `ModeStack.render()` dibuja también los modos de debajo, así el laberinto se ve pausado detrás de la ventana (y no se queda en negro al redimensionar). El laberinto no recibe `update` mientras tanto: todo (fantasmas, lava, poderes) queda congelado. El resultado es `{ won }`; el minijuego hace `pop()` y llama a `done` una vez.
- **Resultado:** ganar → poder especial aleatorio (D-031). Perder → muerte con causa `minigame` ("¡HAS PERDIDO AL PONG!" en el Game Over). En modo dios (D-023) perder no mata.
- **Eventos nuevos** en `RunState`: `portalEntered`, `minigameResult`, `specialPower`.

## D-030 · Pong: primero a 3, rival con IA batible
- **Fecha:** 2026-11-14 · **Estado:** Vigente (afinable en `CONFIG.minigames.pong`)
- **Decisión:** ventana con campo de 160 × 120 píxeles lógicos escalado a múltiplo entero, marcador con cifras de 3 × 5 dibujadas a mano y líneas de barrido CRT. W/S o flechas. Cuenta atrás de 3 s, gana el primero a 3 puntos, el resultado se muestra 2,4 s (Enter/Espacio lo salta). El ángulo de rebote depende de dónde golpea la bola en la pala y la bola acelera un 7 % por golpe. Lógica (`PongGame`) separada del dibujo (`PongMode`).
- **IA:** predice el punto de llegada (con rebotes) pero solo reacciona cuando la bola ha cruzado el 40 % del campo, se mueve más despacio que el jugador (72 frente a 120 px/s) y apunta con un error que **crece con la velocidad de la bola**, así que los peloteos largos la hacen fallar. Con una IA sin esas limitaciones no fallaba nunca.
- **Medido** (simulación de 400 partidas por nivel contra un jugador automático de habilidad variable): habilidad baja gana ~11 %, media ~33 %, buena ~77 %, alta ~100 %. Partida media ≈ 30–45 s.

## D-031 · Poderes especiales; el primero, GIGANTE
- **Fecha:** 2026-11-14 · **Estado:** Vigente (valores sujetos a cambio, como indicó el usuario)
- **Decisión:** `SpecialPowers` guarda el poder activo (uno a la vez); al ganar se elige al azar de `CONFIG.specialPowers.pool` (hoy solo `giant`) y se activa solo, con un anuncio grande "¡GIGANTE! PODER ESPECIAL" y una barra de tiempo arriba en el centro.
- **GIGANTE** (`specialPowers.giant`): 5 s, tamaño ×3 (crece con rebote, parpadea el último 1,2 s y encoge), velocidad ×1,3. Mientras dura:
  - Atraviesa muros y **se come todo lo que toca** en ≈ 3 × 3 casillas (`reach` 1,45): muros (con pedazos voxel más gruesos para no saturar el efecto), puntos y energizadores. El borde exterior no se come y su centro no entra en la columna pegada al borde.
  - Se come a **cualquier fantasma** cercano, asustado o no, con la puntuación en cadena de siempre (la cadena se reinicia al empezar el poder). Los fantasmas no le pueden matar.
  - **La lava sí sigue matando** (no se pidió lo contrario; anotado como posible cambio).
  - Comerse muros no da puntos (solo los puntos y fantasmas que se coma).
- **Rendimiento:** comer muros reconstruye las secciones tocadas; medido sin diferencia apreciable frente al juego normal (render por software).
- **Cambio (petición del usuario):** la duración de los poderes especiales sube 3 s: GIGANTE pasa de 5 a 8 s (`specialPowers.giant.duration`).

## D-032 · Menú de modo dios con la tecla K
- **Fecha:** 2026-11-14 · **Estado:** Vigente (sustituye D-023 y el interruptor `dev.infinitePowers` de D-018)
- **Contexto:** el usuario quiere un modo dios más completo para desarrollar: con K, activar o desactivar habilidades, invencibilidad y poderes especiales, con la estética más simple posible. Pide también quitar el romper muro infinito por defecto.
- **Decisión:** K abre un menú (`maze-run/dev/GodMenuMode.ts`) que se apila como modo superpuesto y **pausa la partida**; K o Esc lo cierran. Las opciones se cambian con las teclas 1–9: (1) invencible, (2) romper muro infinito, (3…) cada poder de `specialPowers.pool` (activar, o terminar si ya está activo). Se abre en las fases `ready` y `playing`.
  - Los trucos (invencible y muro infinito) **se recuerdan entre partidas y recargas** (localStorage, `maze-run/dev/GodSettings.ts`), para no tener que activarlos cada vez. Activar un poder desde el menú solo afecta a la partida actual.
  - "Invencible": ni fantasmas, ni lava, ni perder un minijuego matan (lo que antes hacía el modo dios).
  - Romper muro: por defecto **0 cargas** (`powers.wallBreak.startCharges`); con el truco, sin gastar cargas ("CARGAS INF (DIOS)").
  - Mientras haya trucos activos se ve arriba "DIOS: INVENCIBLE · MURO INF [K]". Una partida en la que se ha usado cualquier truco o poder del menú no guarda récords.
  - Aspecto mínimo a propósito: texto blanco sobre una caja negra.
- **Configuración:** `CONFIG.dev.godMenuKey` (sustituye a `godModeKey` e `infinitePowers`).
- **Cambio (mismo día, feedback del usuario):** al activar un poder con la tecla 3, el menú seguía diciendo "NO" porque el poder no empieza hasta acabar la cinemática (D-035). Ahora el menú tiene dos secciones: **TRUCOS** (teclas 1–9 o clic) y **PODERES ESPECIALES** (solo clic): al hacer clic en un poder se cierra el menú y se lanza con su cinemática; si ya está activo, el botón dice "ACTIVO: QUITAR" y lo termina.

## D-033 · Protagonista plano (grosor uniforme)
- **Fecha:** 2026-11-14 · **Estado:** Vigente
- **Contexto:** el usuario vio en grande (poder GIGANTE) que el protagonista era una esfera de vóxeles con relieve; lo quiere 3D pero más plano, pensando en animaciones futuras.
- **Decisión:** el sprite se extruye con grosor uniforme, como una chapa: 3 vóxeles (`HERO_HALF_DEPTH` = 1 en `entities/sprites.ts`) en vez del perfil abombado (hasta 9). De frente se ve igual; en vistas inclinadas muestra un canto recto del color del borde. El ojo sobresale un vóxel por cada cara. Los fantasmas y energizadores mantienen su relieve (no se pidió cambiarlos).
- **Cómo afinar:** `HERO_HALF_DEPTH` = 0 da un disco de 1 vóxel; 2, uno de 5.

## D-034 · Fantasmas algo más planos
- **Fecha:** 2026-11-14 · **Estado:** Vigente
- **Contexto:** petición del usuario, a juego con el protagonista plano (D-033), pero solo "un poco".
- **Decisión:** se mantiene el perfil redondeado del cuerpo, pero su relieve baja de un máximo de 3 vóxeles de media profundidad a 2 (factor 0,5 → 0,3 en `ghostGeometry`). Ojos y cara siguen sobresaliendo un vóxel.

## D-035 · Cinemática al recibir un poder especial
- **Fecha:** 2026-11-14 · **Estado:** Vigente (tiempos sujetos a cambio, en `CONFIG.specialPowers.cinematic` y `giant.intro`)
- **Contexto:** petición del usuario: al recibir un poder, el protagonista sale volando hacia la cámara hasta ocupar gran parte del laberinto, hace algo propio del poder y cae violentamente a su sitio dejando humo. En 3–5 s.
- **Decisión:** `effects/PowerCinematic.ts` genera una pose del protagonista por fotograma (`PlayerView.applyPose`) sin tocar su lógica; la partida queda congelada en la fase `cinematic` y el poder empieza al aterrizar (así su tiempo no se gasta en la animación). Etapas:
  1. **Subida** (0,7 s): vuela en línea recta hacia un punto ante la cámara, dando una vuelta sobre sí mismo mientras se orienta de frente a la cámara, hasta ocupar el 42 % del alto de pantalla. La distancia se calcula para el tamaño aparente, así que funciona igual en las 4 vistas.
  2. **Acto** (propio de cada poder; el tipo obliga a que cada poder nuevo tenga el suyo). GIGANTE (2,15 s): una cereza (pixel art propio) entra en arco desde la derecha, se la come con tres mordiscos y crece en 3 escalones (escala 1 → 1,67 → 2,33 → 3), cada uno con un "pop" que se pasa y se asienta y una sacudida de cámara creciente, hasta ocupar el 72 % de la pantalla.
  3. **Caída** (0,3 s): acelera (curva cúbica) hasta su sitio, con la boca abierta y volviendo a mirar en su dirección.
  4. **Golpe** (0,3 s): sacudida fuerte, anillo de 40 bocanadas de humo voxel (`effects/SmokeEffect.ts`) por encima de los muros (a ras de suelo los muros lo tapaban) y aplastamiento con rebote. Después, el anuncio "¡GIGANTE!" y empieza el poder.
- **Total GIGANTE:** ≈ 3,45 s. La animación de crecer dentro de la partida desaparece (ya crece en la cinemática); se mantienen el parpadeo final y el encogimiento (`giant.shrinkTime`).
- **También desde el menú de modo dios** (D-032): activar un poder reproduce la cinemática, útil para afinarla.
- **Cambio (mismo día, petición del usuario):** en la subida y en la caída, además de girar sobre su propio eje (como un disco), da una vuelta sobre el eje vertical (como una moneda: a mitad de vuelta se le ve el canto). Antes la caída no giraba. Vueltas en `cinematic.riseTurns` y `fallTurns` (`disc` y `flip`; 1 y 1 por defecto). En la caída el giro sigue la misma curva acelerada, así que se concentra al final.

## D-036 · Poder GHOUL: tentáculos para caminar por encima del laberinto
- **Fecha:** 2026-11-14 · **Estado:** Vigente la mecánica; aspecto, tamaño, tentáculos y cinemática sustituidos por D-037
- **Contexto:** petición del usuario: cuatro tentáculos rojos gruesos con venas más brillantes; el protagonista camina con ellos por encima de los bloques, los bloques que pisa se rompen y los fantasmas cercanos son pisoteados; 10 s, velocidad ×1,2. En la cinemática le salen los tentáculos, un ojo rojo y una máscara.
- **Máscara:** el usuario dio como referencia la de un personaje de anime con copyright. No se copia ese diseño: se hace una **máscara propia** con la misma idea, un bozal negro sobre la mitad delantera de abajo con correa hacia la nuca, la boca en negro (sin dientes, como pidió), un ojo de esclerótica negra e iris rojo y venas rojas en la piel. En el juego el poder se llama "GHOUL".
- **Juego:**
  - Va por encima de cualquier casilla salvo el borde exterior, con el cuerpo a +1,05 de altura (por encima de los muros). No rompe nada al pasar, solo donde pisa.
  - **Patas** (`systems/GhoulLegs.ts`): cuatro pies con reposo en diagonal alrededor del cuerpo. Un pie da un paso (0,13 s, en arco) cuando se aleja `stride` de su reposo, adelantado según la velocidad. Las dos parejas diagonales se turnan, y un pie muy rezagado pisa igualmente. *(Primera versión: una pareja acaparaba los turnos y la otra se quedaba a 8–10 casillas por detrás; corregido y medido.)*
  - **Cada pisada** rompe el bloque de debajo (si no es el borde), con pedazos, una sacudida pequeña y polvillo, y mata a los fantasmas a menos de `stompRadius` de la punta.
  - **Pisotón:** si un fantasma entra a menos de `stompRange` (2,8) del cuerpo, el pie libre más cercano lo persigue y lo pisa (0,13 s). Tocar el cuerpo también lo mata. Los fantasmas no le hacen daño; la lava sí.
  - **Al acabar** baja al suelo y recoge los tentáculos (0,4 s). Si queda encima de un muro o en un agujero aislado hecho por una pisada, se abre el camino que atraviesa menos muros hasta los pasillos (`maze/escape.ts`: BFS 0-1 hasta una zona abierta de 40 casillas o más), así nunca queda atrapado.
  - Puede haber agujeros sueltos de pisadas dentro de los muros (huecos sin salida). Se aceptan: son decorativos y el final del poder nunca deja al jugador en uno.
- **Tentáculos** (`effects/TentacleView.ts`): tubos facetados que se estrechan hacia la punta (radio 0,24 → 0,06), rojo oscuro con bandas y tres venas que serpentean y brillan (mapa de emisión). Se reconstruyen cada fotograma a lo largo de una curva. Como patas, se arquean desde la espalda hacia arriba y bajan hasta cada pie.
- **Cinemática** (acto en `PowerCinematic`, ≈ 2,1 s): con un rugido le brotan los cuatro tentáculos de la espalda en abanico, uno cada 0,24 s y con sacudida, y se agitan. A los 1,2 s aparecen la máscara y el ojo con un golpe. Los tentáculos le acompañan en la caída y, al aterrizar, se clavan alrededor rompiendo los bloques de debajo.
- **Cambios generales:** `SpecialPowers` pasa a ser genérico (`isOn`, `outro`, `look`, `ghoulLift`; `giant.shrinkTime` pasa a `outroTime`, común a todos los poderes). Un poder nuevo sustituye al activo sin su animación de salida. `GhostDirector.devourAt` mata fantasmas alrededor de cualquier punto. Ganar un minijuego elige al azar entre GIGANTE y GHOUL.

## D-037 · GHOUL revisado y GIGANTE al doble
- **Fecha:** 2026-11-14 · **Estado:** Vigente
- **Contexto:** al usuario le convencen la mecánica y el movimiento de los tentáculos, pero no su aspecto (demasiado curvos y lisos) ni la animación. Pide descartar la máscara, un protagonista gris oscuro con el ojo rojo, más grande (casi como el GIGANTE) y, para diferenciarlos, el GIGANTE al doble.
- **Tentáculos de vóxeles** (`effects/TentacleView.ts`, reescrito): en lugar de tubos lisos, cubos alineados con una rejilla y sin girar, colocados a lo largo de la curva y cada vez más pequeños hacia la punta. El cuerpo es rojo oscuro con variaciones por cubo; las venas son cubitos en la superficie, por los ejes de la rejilla, sin sombreado para que brillen. Dos `InstancedMesh`; se rellenan cada fotograma (`set` por tentáculo y `flush` al final).
- **Aspecto:** sin máscara. Cuerpo gris oscuro con borde más oscuro, ojo de esclerótica negra e iris rojo, venas rojas alrededor y la boca normal.
- **Tamaño:** GHOUL ×2,6 (y todo a escala: reposo de los pies ±2,4 × ±2,0, zancada 1,5, altura de paso 1,4, alcance del pisotón 3,8, radio 1,3, tentáculos de radio 0,36 → 0,09). El cuerpo grande también mata al tocar. Encoge al acabar.
- **Patas bajo el cuerpo:** salen del borde del cuerpo por debajo de él y bajan en arco a cada pie. *(Al arquearlas por encima, en la primera prueba tapaban el cuerpo por completo y solo se veía una X roja.)* En la cinemática quedan detrás del cuerpo.
- **Nueva cinemática** (≈ 2,3 s de acto): (1) se oscurece parpadeando entre amarillo y gris, cada vez más gris, y se le enciende el ojo; (2) crece de golpe (0,3 s, con sacudida) hasta ×2,6; (3) le brotan los cuatro tentáculos de vóxeles uno a uno y se agitan; luego cae como siempre y aterriza clavándolos.
- **GIGANTE ×6** (antes ×3): come el doble de ancho (`reach` 2,9 ≈ 6×6 casillas). Su centro no entra en muros a menos de 3 columnas del borde, para que el cuerpo no lo atraviese.
- **Ajustes posteriores (petición del usuario):**
  - **Caída al acabar:** además del camino de escape, rompe todos los bloques a menos de `landBreakRadius` (1,6) de su centro, con sacudida y anillo de humo. Así nunca queda atrapado entre bloques que las pisadas dejaron sueltos. Probado acabando el poder 6 veces en sitios distintos, 2 de ellas encima de un muro: siempre termina en una casilla abierta con salida.
  - **Movimiento más caótico, sin pasarse:** los puntos intermedios de cada tentáculo se retuercen con dos ondas de frecuencias distintas por tentáculo, de lado y en altura (`writhe` 0,22). En la cinemática, igual en el ángulo.
  - **Cinemática en estrella:** los tentáculos ya no salen solo de la espalda (detrás de la boca), sino uno en cada diagonal (45°, 135°, 225° y 315°), y más largos (1,45 × escala), así que ocupan más pantalla.

## D-038 · Color de las paredes según el poder
- **Fecha:** 2026-11-14 · **Estado:** Vigente
- **Contexto:** petición del usuario: con GHOUL, paredes rojas que cambian rápido entre un rojo muy apagado y uno intenso, como una alerta; con GIGANTE, simplemente un cambio de color habitual más rápido.
- **Decisión:** `NeonCycle` (`render/neon.ts`) gana dos controles que maneja `MazeRunMode.updateWallColor()` cada fotograma:
  - `speed`: multiplica la velocidad del ciclo de colores. Con GIGANTE, ×5 (`giant.neonSpeed`).
  - `alert`: parpadeo entre dos colores que sustituye al ciclo, con un fundido de entrada y salida de 0,2 s. Siempre empieza en el pulso intenso. Con GHOUL, entre 0x2a0006 y 0xff1a2c, periodo 0,4 s, intenso el 45 % (`ghoul.wallAlert`). Empieza al aterrizar la cinemática y dura hasta el final de la animación de salida.
- **Consecuencias:** todo lo que usa el color del laberinto (contornos, laterales, suelo, rejilla de fondo y pedazos de los bloques rotos) se tiñe igual. El ciclo normal sigue avanzando por debajo, así que al acabar continúa donde iba. Los tentáculos rojos se distinguen algo menos sobre las paredes rojas; queda anotado por si hace falta contraste.

## D-039 · Puntos flotantes más llamativos
- **Fecha:** 2026-11-14 · **Estado:** Vigente
- **Contexto:** petición del usuario: al comer un fantasma o un energizador, los puntos deben saltar más llamativos y algo más grandes.
- **Decisión:** solo CSS (`.popup` en `src/style.css`), ya que solo esos dos casos muestran puntos flotantes. La letra pasa de 12 a 20 px y la animación de 0,9 a 1,2 s, a saltos (`steps(24)`) para mantener el aire retro. Entra de golpe desde ×0,2 hasta ×1,75 inclinado, rebota con pequeños giros, parpadea entre blanco, amarillo, rosa y cian con un halo de su color y sube 64 px mientras se desvanece. La "X" de fallo al romper muro mantiene la animación anterior (`popup-fail`).

## D-040 · Lista de récords de distancia a la izquierda
- **Fecha:** 2026-11-14 · **Estado:** Vigente
- **Contexto:** petición del usuario: una lista de récords de distancia a la izquierda de la pantalla, grande, casi como la cifra de altura de la partida.
- **Datos:** `Records` guarda además `topDistances`, las 5 mejores distancias (`TOP_DISTANCES`) de mayor a menor, en la misma clave de localStorage. Los récords antiguos empiezan la lista con su `bestDistance`. Ante un empate, la partida nueva va detrás. Las partidas con trucos del modo dios no cuentan, igual que los demás récords. `submit` devuelve también el puesto conseguido (`distanceRank`, -1 si no entra).
- **Interfaz** (`ui/RecordsList.ts`): título "RECORDS" y 5 filas con el puesto pequeño y la cifra grande (48 px; la altura tiene 60), que flotan con `JuicyText`. Colores: 1.º amarillo, 2.º blanco, 3.º naranja, el resto lila, y "---" apagado para los huecos. Se centra entre el borde izquierdo de la pantalla y el del laberinto (proyectado, como la columna de la derecha) y se encoge si no cabe de ancho o de alto (`CONFIG.ui.records`). Al acabar la partida se actualiza y, si se ha entrado en la lista, esa fila salta, suelta chispas y parpadea.
- **Verificación:** capturas a 1280×720, 1920×1080 y 1024×768 con la lista vacía y con 4 récords.

## D-015 · Pruebas fuera del repositorio (provisional)
- **Fecha:** 2026-11-13 · **Estado:** En revisión
- **Decisión actual:** el test de conectividad del generador, el fuzzing de movimiento y las capturas con Edge headless + `puppeteer-core` se ejecutaron desde un directorio temporal, sin añadir dependencias al proyecto.
- **Pendiente:** decidir si se incorporan al repo como `npm test` (ver PLAN.md).
