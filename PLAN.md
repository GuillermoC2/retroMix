# Plan de desarrollo

Documento vivo. Se actualiza al empezar y al terminar cada tarea. Las decisiones que surjan se registran en
[DECISIONS.md](DECISIONS.md).

Leyenda: `[x]` hecho · `[~]` en curso · `[ ]` pendiente · `[?]` propuesta sin aprobar (requiere visto bueno del usuario)

**Estado actual:** Fase 1.2 completada (poder romper muros, con cargas infinitas en modo desarrollador). Siguiente paso: probar el poder y la partida y dar feedback; decidir cómo se ganan las cargas.

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

## Siguiente — Ajuste por juego real

- [ ] El usuario prueba el juego y da feedback sobre la sensación de control, la presión y la dificultad
- [ ] Afinar `scroll`, `lava`, `ghosts` y el ritmo de energizadores según ese feedback
- [ ] Comprobar el rendimiento en GPU real (las pruebas usaron render por software)

## Propuestas pendientes de aprobar `[?]`

No se harán sin el visto bueno del usuario (se evita añadir funcionalidades no pedidas).

- [?] **Cómo se ganan cargas de romper muro** en el juego normal (p. ej. objeto en el laberinto, cada N metros, recompensa de minijuego en la Fase 2). Al decidirlo: `dev.infinitePowers = false` y ajustar `powers.wallBreak.startCharges`
- [?] Incorporar las pruebas al repo como `npm test`: conectividad del generador y fuzzing de movimiento (D-015)
- [?] Sonido y efectos (comer, energizador, muerte, música)
- [?] Tecla de pausa
- [?] Controles táctiles o móvil
- [?] Hacer que el borde del HUD siga el color neón de la zona actual
- [?] Retocar el sprite del protagonista mirando hacia arriba (parado, se lee algo como un corazón)

## Fase 2 — Minijuegos como desafíos (alcance por definir)

Se definirá con el usuario antes de empezar. Esqueleto previsto según la arquitectura actual (D-007):

- [ ] Definir con el usuario: qué dispara un desafío (metros, objeto en el laberinto, aleatorio…), qué minijuego va primero y qué recompensas o castigos hay
- [ ] Sistema de desafíos: escucha `RunState.events`, apila el minijuego con `ModeStack.push` y aplica el resultado
- [ ] Contrato mínimo de resultado de minijuego (cerrarlo con el primer caso real, sin sobreingeniería)
- [ ] Primer minijuego
- [ ] Efectos del resultado sobre la partida: `RunState.modifiers`, `Maze.setTile`, fantasmas y lava

## Deuda técnica y problemas conocidos

- Bundle de unos 580 kB por Three.js (aceptado, D-001).
- Las líneas en perspectiva muestran dientes de sierra por el render a baja resolución (aceptado, D-002).
- Las pruebas no están en el repo (D-015).
- Sin control de versiones: el proyecto no es un repositorio git. Recomendable inicializarlo antes de la Fase 2.

## Cómo se usa este documento

1. Al empezar una tarea, se marca `[~]`. Al terminarla, `[x]` y se mueve el "Estado actual" si procede.
2. Cada decisión no trivial (o un cambio de una anterior) va a DECISIONS.md, y aquí se referencia su `D-NNN`.
3. Las ideas nuevas entran como `[?]` hasta que el usuario las aprueba.
4. Los parámetros de juego se cambian en `src/config.ts`. Si un ajuste cambia el diseño, va también a DECISIONS.md.
