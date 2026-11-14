# Plan de desarrollo

Documento vivo. Se actualiza al empezar y al terminar cada tarea. Las decisiones que surjan se registran en
[DECISIONS.md](DECISIONS.md).

Leyenda: `[x]` hecho · `[~]` en curso · `[ ]` pendiente · `[?]` propuesta sin aprobar (requiere visto bueno del usuario)

**Estado actual:** Fase 2 (primera integración) completada: portales cada 150 m, Pong, poder GIGANTE (8 s) con su cinemática y menú de modo dios. Siguiente paso: nuevos poderes especiales. Pendiente para más adelante: mejorar la interfaz y el funcionamiento del Pong.

---

## Fase 1 — Laberinto infinito jugable ✅ (2026-11-13)

- [x] Base del proyecto: Vite + TS + Three.js, bucle, entrada, pila de modos, eventos, récords — D-001, D-007
- [x] Generador procedural con conectividad garantizada y 4 estilos de sección — D-005
- [x] Creación y destrucción de secciones por rendimiento (4–5 activas)
- [x] Movimiento del jugador: WASD y flechas, búfer, tolerancia de giro, colisiones precisas — D-008
- [x] Puntos, energizadores (preferentemente al fondo de callejones) y puntuación
- [x] Fantasmas: 4 personalidades, dispersión/persecución, modo asustado, ojos de vuelta, población según distancia — D-009
- [x] Lava animada que mata, con velocidad creciente y un máximo que no se supera
- [x] Estética 2.5D: render pixelado, vóxeles, sombras y 4 cámaras con la tecla C — D-002, D-003
- [x] HUD (metros a la izquierda del laberinto, puntos), popups, Game Over, reinicio y récords — D-013, D-014
- [x] Parámetros centralizados en `src/config.ts`
- [x] Verificación: conectividad (300 semillas), fuzzing de movimiento, partida completa con piloto automático

## Fase 1.1 — Iteración tras la primera prueba ✅ (2026-11-14)

- [x] El escenario sube solo y la lava queda atada al borde inferior de la pantalla — D-011
- [x] Muros más altos (`wallDepth` 1,1) — D-012
- [x] Muros con degradado neón animado — D-012
- [x] DECISIONS.md y PLAN.md

## Fase 1.2 — Poder: romper muros

- [x] Romper muro con **Espacio**: túnel recto a través de todo el grosor del muro hasta el pasillo del otro lado — D-016, D-017
- [x] Animación: el bloque estalla en pedazos voxel del color neón del muro, con destello, sacudida de cámara y rediseño de contornos
- [x] Cargas infinitas mientras `CONFIG.dev.infinitePowers = true`; indicador de cargas en el HUD — D-018
- [x] Verificación: 4.500 intentos aleatorios sin romper el borde ni dejar zonas inaccesibles; animación comprobada en el juego

## Fase 1.3 — Color único y lava que se puede dejar atrás

- [x] Repositorio git inicializado y primer commit (`586a76d`)
- [x] El laberinto tiene un único color neón que cambia con el tiempo con un degradado (no un degradado por alturas) — D-019
- [x] La lava puede quedarse atrás (fuera de pantalla) al subir rápido, pero vuelve al poco tiempo — D-020
- [x] Ajustes de la lava según feedback (se ocultaba demasiado → se veía siempre → punto intermedio) — D-020

## Fase 1.4 — Mejora visual del laberinto ✅

- [x] Contorno tipo tubo de neón (línea + halo), laterales con canto brillante y resplandor en la base, rejilla de fondo — D-021
- [x] Aprobada por el usuario

## Fase 1.5 — Altura flotante (interfaz con reacciones estilo Balatro)

- [x] La cifra de altura sale del panel azul: grande, flotante, con balanceo rítmico; crece y reacciona cada 100 m — D-022
- [x] Componente reutilizable de texto con reacciones (`src/ui/JuicyText.ts`, base para futuros efectos de interfaz) — D-022
- [x] La cifra de altura se mueve a la esquina superior derecha — D-024
- [x] Crece menos y se centra sobre el panel de puntos — D-025
- [ ] Más efectos para la cifra de altura (a petición del usuario, en el futuro)

## Fase 1.6 — Interfaz sin cajas, en columna a la derecha del laberinto

- [x] Solo escritorio: en pantallas de móvil (o ventanas pequeñas o verticales) se muestra un aviso y el juego se detiene — D-026
- [x] Altura centrada entre el borde derecho del laberinto y el de la pantalla — D-027
- [x] Puntos fuera de la caja: cifra flotante que cuenta hacia arriba y reacciona según lo ganado — D-027
- [x] Abajo a la derecha, ayudas con icono de tecla pixelado: "C CAMBIAR VISTA" y "ESPACIO ROMPER MURO" — D-027
- [x] Verificación: capturas a 1280×720, 1440×900, 1920×1080 y 1024×768, y aviso en tamaños de móvil
- [x] Puntos de fantasmas y energizadores más llamativos: más grandes, entran con rebote, parpadean entre colores neón con halo y suben flotando — D-039
- [x] Lista de las 5 mejores distancias a la izquierda del laberinto, con cifras grandes (48 px, casi como la altura) que flotan; el puesto nuevo parpadea al acabar la partida — D-040

## Herramientas de desarrollo

- [x] Modo dios con la tecla K (no se puede morir), solo para desarrollo — D-023
- [x] Cargas infinitas de romper muro (`dev.infinitePowers`) — D-018
- [x] Menú de modo dios con K: activar/desactivar invencibilidad, romper muro infinito y cada poder especial; el romper muro infinito deja de estar activo por defecto — D-032
- [ ] Antes de publicar: poner a `false` todo lo de `CONFIG.dev`

## Siguiente — Ajuste por juego real

- [ ] El usuario prueba el juego y da feedback sobre la sensación de control, la presión y la dificultad
- [ ] Afinar `scroll`, `lava`, `ghosts` y el ritmo de energizadores según ese feedback
- [ ] Comprobar el rendimiento en GPU real (las pruebas usaron render por software)

## Propuestas pendientes de aprobar `[?]`

No se harán sin el visto bueno del usuario (se evita añadir funcionalidades no pedidas).

- [?] **Cómo se ganan cargas de romper muro** en el juego normal (p. ej. objeto en el laberinto, cada N metros, recompensa de minijuego en la Fase 2). Al decidirlo: ajustar `powers.wallBreak.startCharges` (hoy 0; sin cargas solo se rompe con el truco del modo dios, D-032)
- [?] Incorporar las pruebas al repo como `npm test`: conectividad del generador y fuzzing de movimiento (D-015)
- [?] Sonido y efectos (comer, energizador, muerte, música)
- [?] Tecla de pausa
- ~~Controles táctiles o móvil~~ — descartado: el juego es solo para escritorio (D-026)
- [?] GIGANTE inmune a la lava (ahora la lava sí le mata, D-031)
- [?] Puntos por cada muro comido por el GIGANTE
- [?] Atajo de desarrollo para saltar al siguiente portal
- [?] Lista de récords que reacciona en directo: al superar una distancia de la lista durante la partida, esa fila salta y se marca como superada
- [?] Retocar el sprite del protagonista mirando hacia arriba (parado, se lee algo como un corazón)

## Fase 2 — Minijuegos como desafíos: portales

Cada cierta distancia aparece una sala amplia con un portal en el centro. Se puede esquivar o entrar. Dentro se juega
un minijuego retro en una ventana con el laberinto pausado: si se gana, se obtiene un poder especial aleatorio que se
activa solo; si se pierde, se acaba la partida.

- [x] Salas con portal cada N metros en el generador (conectividad intacta) — D-028
- [x] Portal visible y con el nombre del juego; se entra pisándolo; se cierra al usarlo — D-028
- [x] Contrato de minijuego y registro de juegos (el portal elige uno al azar) — D-029
- [x] El minijuego se dibuja encima del laberinto pausado (modos superpuestos en `ModeStack`) — D-029
- [x] Primer minijuego: Pong (primero en llegar a N puntos, rival con IA) — D-030
- [x] Ganar: poder especial aleatorio que se activa solo. Primer poder: GIGANTE (×3, más rápido, come muros, fantasmas y puntos, 8 s) — D-031
- [x] Perder: fin de la partida con su propio motivo en el Game Over — D-029
- [x] Verificación: generador (300 semillas, 2.400 salas, conectividad intacta), equilibrio del Pong por simulación, flujo completo en el navegador (entrar, ganar → gigante, perder → Game Over) y rendimiento
- [x] Protagonista plano, de grosor uniforme (pensando en animaciones futuras) — D-033
- [x] Fantasmas algo más planos — D-034
- [x] Cinemática al recibir un poder especial: sale volando hacia la cámara, hace la acción del poder (GIGANTE: come una cereza y crece en 3 escalones) y cae de golpe dejando humo; ~3–4 s — D-035
- [ ] El usuario prueba y ajusta: dificultad del Pong, distancia entre portales, duración/tamaño/velocidad del gigante
- [ ] Mejorar la interfaz y el funcionamiento del Pong (pedido por el usuario; se hará más adelante)
- [x] Poder GHOUL: 4 tentáculos rojos con venas, camina por encima de los muros rompiendo los que pisa y pisa a los fantasmas; máscara original y ojo rojo; 10 s, ×1,2 — D-036
- [x] GHOUL revisado: tentáculos de vóxeles, sin máscara (gris oscuro con ojo rojo), más grande (×2,6), nueva animación; GIGANTE al doble (×6) — D-037
- [x] Color de las paredes con los poderes: alerta roja con GHOUL, cambio de color más rápido con GIGANTE — D-038
- [x] Corregido: al recibir un segundo poder se veía un momento el anuncio del primero (la animación se repetía al volver a mostrar la interfaz tras el minijuego o el menú K)
- [ ] Más poderes especiales
- [ ] Más minijuegos (Tetris, Space Invaders…)
- [ ] Animaciones de entrada y salida del portal más elaboradas (a petición del usuario, más adelante)

## Deuda técnica y problemas conocidos

- Bundle de unos 580 kB por Three.js (aceptado, D-001).
- Las líneas en perspectiva muestran dientes de sierra por el render a baja resolución (aceptado, D-002).
- Las pruebas no están en el repo (D-015).

## Cómo se usa este documento

1. Al empezar una tarea, se marca `[~]`. Al terminarla, `[x]` y se mueve el "Estado actual" si procede.
2. Cada decisión no trivial (o un cambio de una anterior) va a DECISIONS.md, y aquí se referencia su `D-NNN`.
3. Las ideas nuevas entran como `[?]` hasta que el usuario las aprueba.
4. Los parámetros de juego se cambian en `src/config.ts`. Si un ajuste cambia el diseño, va también a DECISIONS.md.
