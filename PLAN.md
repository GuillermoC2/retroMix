# Plan de desarrollo

Documento vivo. Se actualiza al empezar y al terminar cada tarea. Las decisiones que surjan se registran en
[DECISIONS.md](DECISIONS.md).

Leyenda: `[x]` hecho · `[~]` en curso · `[ ]` pendiente · `[?]` propuesta sin aprobar (requiere visto bueno del usuario)

**Estado actual:** Fase 3 (muros portal y tienda de habilidades) hecha y tercer poder especial, FUEGO HIELO (D-055), con poderes y habilidades que ya no se mezclan (D-054), a la espera de que el usuario los pruebe; todo sujeto a cambios hasta que le guste. Con esto queda la base del juego: lo siguiente es ir añadiendo habilidades, minijuegos y alguna mecánica nueva. Pong rehecho en 2.5D con variante por tipo de entrada y ventana animada (D-056), a la espera de que el usuario lo pruebe.

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

- [x] Romper muro con **Espacio** (hoy **Z**, D-053): túnel recto a través de todo el grosor del muro hasta el pasillo del otro lado — D-016, D-017
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

## Fase 1.7 — Interfaz y mensajes con un sistema común (2026-11-15)

- [x] Cabecera común de sección, mejor marca bajo cada cifra, fondo suave tras las columnas, insignias de puesto y fichas de habilidad — D-059
- [x] Mensajes flotantes de tres tipos: puntos (color y tamaño según el valor), etiquetas de lo ocurrido y fallos — D-059
- [x] Anuncio grande en banda con letras que caen; placa del poder activo con barra por segmentos y segundos — D-059
- [x] Aviso de inicio con las flechas dibujadas; Game Over con ventana animada, cifras que cuentan y distintivo de récord — D-059
- [ ] El usuario prueba y ajusta la nueva interfaz

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
- [x] Menú K, sección PRUEBAS: saltar justo debajo del siguiente muro portal y sumar 10.000 puntos (para probar la tienda) — D-041
- [x] Menú K más ancho, en paneles de colores; TELETRANSPORTE (siguiente portal, siguiente muro, +100/+500/+1000 m) y truco SALTAR MINIJUEGOS (NO / GANAR / PERDER) — D-044
- [ ] Antes de publicar: poner a `false` todo lo de `CONFIG.dev`

## Siguiente — Ajuste por juego real

- [ ] El usuario prueba el juego y da feedback sobre la sensación de control, la presión y la dificultad
- [ ] Afinar `scroll`, `lava`, `ghosts` y el ritmo de energizadores según ese feedback
- [ ] Comprobar el rendimiento en GPU real (las pruebas usaron render por software)

## Propuestas pendientes de aprobar `[?]`

No se harán sin el visto bueno del usuario (se evita añadir funcionalidades no pedidas).

- [?] Incorporar las pruebas al repo como `npm test`: conectividad del generador y fuzzing de movimiento (D-015)
- [?] Sonido y efectos (comer, energizador, muerte, música)
- [?] Tecla de pausa
- ~~Controles táctiles o móvil~~ — descartado: el juego es solo para escritorio (D-026)
- [?] GIGANTE inmune a la lava (ahora la lava sí le mata, D-031)
- [?] Puntos por cada muro comido por el GIGANTE
- [?] Gastar puntos en la tienda baja también la puntuación final y su récord (D-042). Alternativa: llevar aparte los puntos gastables y los totales
- [?] Que perder el minijuego de un muro portal no acabe la partida (p. ej. reintentar pagando puntos o perder una habilidad)
- [?] Mostrar en la tienda las habilidades que ya se tienen y sus efectos sumados
- [?] Lista de récords que reacciona en directo: al superar una distancia de la lista durante la partida, esa fila salta y se marca como superada
- [?] Retocar el sprite del protagonista mirando hacia arriba (parado, se lee algo como un corazón)
- [?] FUEGO HIELO: que el fuego derrita el hielo que toca (ahora son independientes)
- [?] Si "pierdes la habilidad" debía ser la habilidad comprada (para siempre) y no solo su efecto en curso (D-054)

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
- [x] Pong 2.5D con el estilo del laberinto (pista de vóxeles en perspectiva, barandillas de neón, palas y bola con volumen y sombra, marcador de cubos, partículas) — D-056
- [x] Minijuegos distintos según la entrada: en un muro portal gana el primer punto; en un portal de poder especial, 3 puntos y estética rojiza (letras rojas, brasas, avisos de punto en llamas) — D-056
- [x] Sin el texto de abajo de la ventana (controles y recompensa) — D-056
- [x] Ventana de minijuego con animaciones estilo Balatro: entra cayendo y rebota, flota inclinándose, reacciona a golpes y puntos, y sale disparada (arriba al ganar, cayendo al perder) — D-056
- [x] Menos tambaleo de la ventana y de la cámara — D-056
- [x] Muro portal: te pueden marcar 2 veces (pierdes al 3.º gol); portal: solo 1 vez (pierdes al 2.º) — D-056
- [x] Fuego de las letras pixel art (simulación de fuego retro en baja resolución, `ui/PixelFire.ts`) — D-056
- [ ] El usuario prueba el nuevo Pong y ajusta (encuadre, inclinación, colores, animaciones)
- [?] Hacer también el rival del portal especial algo mejor (más rápido o con menos error) además de pedir 3 puntos
- [x] Poder GHOUL: 4 tentáculos rojos con venas, camina por encima de los muros rompiendo los que pisa y pisa a los fantasmas; máscara original y ojo rojo; 10 s, ×1,2 — D-036
- [x] GHOUL revisado: tentáculos de vóxeles, sin máscara (gris oscuro con ojo rojo), más grande (×2,6), nueva animación; GIGANTE al doble (×6) — D-037
- [x] Color de las paredes con los poderes: alerta roja con GHOUL, cambio de color más rápido con GIGANTE — D-038
- [x] Corregido: al recibir un segundo poder se veía un momento el anuncio del primero (la animación se repetía al volver a mostrar la interfaz tras el minijuego o el menú K)
- [x] Poder especial y habilidades se excluyen: con un poder no se cogen objetos de habilidad; al recibir un poder se pierden los efectos de habilidad activos (láser, dash, imán, congelación). Con un poder no se puede usar ROMPEMUROS (la Z queda libre para el poder) — D-054
- [x] FUEGO HIELO dura 20 s (antes 12) — D-055
- [x] Llamarada más grande: 9 casillas de largo (antes 7) y más ancha (medio ancho 0,4 → 1,5) — D-055
- [x] FUEGO HIELO: hielo y fuego cada 0,5 s; la cuña de hielo es una rampa que sube por encima de los muros y deja pasar sobre ellos deslizándose — D-055
- [x] Poder FUEGO HIELO: Z dispara un rastro de hielo en cuña (estrecho → ancho) que come puntos, mata fantasmas y sobre el que se desliza más rápido; X lanza llamaradas que queman bloques, fantasmas y puntos; algo más grande (×1,35); cinemática: el lado izquierdo se congela y el derecho arde — D-055
- [ ] Más poderes especiales
- [x] Segundo minijuego: BLOQUES (piezas que caen, 2.5D): 5 líneas en muro portal, 10 y más rápido en portal especial — D-058
- [x] Ventana y piezas 3D comunes para los minijuegos (`MinigameFrame`, `scene3d`) — D-058
- [ ] Más minijuegos (Space Invaders…)
- [ ] Animaciones de entrada y salida del portal más elaboradas (a petición del usuario, más adelante)

## Fase 3 — Muros portal y tienda de habilidades (2026-11-15)

Cada 100–150 m (+20 m por muro, D-048) un muro portal corta el laberinto de lado a lado. No se puede romper ni rodear: al tocarlo se entra en un
minijuego al azar (su nombre ya aparece sobre el muro). Si se gana, se abre una tienda con 3 habilidades permanentes
(básica azul 2.500, épica morada 5.000, legendaria dorada 10.000 puntos; al principio 5.000/10.000/20.000, D-049) y luego el muro se abre; si se pierde, fin de la
partida. Todo sujeto a cambios hasta que guste al usuario.

- [x] Muro portal en el generador: fila de bloques convertida en barrera (`Tile.Gate`) con las líneas de debajo y de encima abiertas de lado a lado; las salas con portal se apartan — D-041
- [x] Nadie lo atraviesa: jugador, fantasmas, romper muro, GIGANTE, GHOUL y el camino de escape del GHOUL lo respetan — D-041
- [x] Aspecto: campo de energía pixelado con flechas que suben, barandillas, pilares y dos emblemas de portal; recorre el arcoíris; se disuelve y se hunde al abrirse — D-041
- [x] Cartel con el nombre del minijuego en el centro del muro ("PONG · MURO PORTAL · TOCALO PARA ENTRAR") — D-041
- [x] Tocarlo (empujar hacia arriba desde la línea de debajo): el jugador se mete en el muro y empieza el minijuego (por ahora siempre Pong) — D-041
- [x] Ganar → tienda de habilidades con 3 cartas flotantes a pantalla completa; perder → Game Over — D-042
- [x] Tienda: teclado (flechas, Enter, 1–3, Esc) y ratón; cartas bloqueadas si faltan puntos; casillas vacías; se compra una como mucho — D-042
- [x] Habilidades: catálogo por niveles (básica, épica, legendaria) y lista de compradas en el HUD — D-042
- [x] Primera habilidad básica: SUSTO LARGO (+2 s al susto de los energizadores) — D-043
- [x] Habilidades únicas por partida; algunas con mejora "+" (SUSTO LARGO hasta 2: SUSTO LARGO +); menú K: sección HABILIDADES para darlas — D-045
- [x] Habilidad épica HIELO: cubitos de hielo cada 70 m; al cogerlo, fantasmas congelados 5 s (no matan; sí se comen asustados, con poderes o con el láser) — D-046
- [x] Habilidad legendaria LASER (y LASER +): bolas naranjas cada 80 m; al comer una, láser por la boca 5 s (8 s con +) que se come a los fantasmas — D-047
- [x] Sin anuncio grande al obtener una habilidad (es de los poderes especiales) — D-045
- [x] Muros portal cada 100–150 m, +20 m por cada muro cruzado — D-048
- [x] Precios de las habilidades a la mitad: 2.500 / 5.000 / 10.000 — D-049
- [x] Habilidad épica DASH: plumas; al coger una, 10 s azulado con dash en X (recarga 1 s) que mata fantasmas — D-051
- [x] Teclas: ROMPEMUROS pasa a la Z; X es la tecla de acción general (en el HUD, "X ACCION" o la acción disponible) — D-053
- [x] Habilidad básica IMAN (e IMAN +): imanes; al coger uno, 5 s (10 s) atrayendo los puntos pequeños cercanos — D-052
- [x] ROMPEMUROS: 2 usos al empezar y +1 por cada portal o muro portal superado; en el HUD, "ROMPEMUROS" con los usos en grande — D-050
- [x] Verificación: generador (300 semillas, 1.200 muros: posición, forma, sin salas cerca y cada tramo entre muros conectado), flujo completo en el navegador (saltar al muro, entrar, ganar, comprar, abrir y seguir; perder → Game Over; tienda sin puntos), muro irrompible e impasable con los poderes, capturas a 1024×768, 1280×720 y 1920×1080
- [ ] El usuario prueba y ajusta: distancia entre muros, aspecto del muro, tienda, precios
- [ ] Más habilidades (básicas, épicas y legendarias)
- [x] Portales especiales en uno de cada dos tramos entre muros (portal, muro, muro, portal…), con un 20 % de excepciones en los demás tramos — D-057
- [ ] Más minijuegos para los muros (y los portales)
- [?] Mostrar en el HUD el tiempo que queda de congelación (HIELO) y de láser
- [?] Si el mapa se queda corto de objetos de habilidad: acortar su intervalo con cada muro superado (p. ej. 100 m, −8 % por muro, mínimo 35–40 m). Por ahora el usuario prefiere el intervalo fijo: el mapa se llenará al añadir habilidades
- [?] LASER es legendaria por elección propia (el usuario no indicó el nivel, D-047)

## Deuda técnica y problemas conocidos

- Bundle de unos 580 kB por Three.js (aceptado, D-001).
- Las líneas en perspectiva muestran dientes de sierra por el render a baja resolución (aceptado, D-002).
- Las pruebas no están en el repo (D-015).

## Cómo se usa este documento

1. Al empezar una tarea, se marca `[~]`. Al terminarla, `[x]` y se mueve el "Estado actual" si procede.
2. Cada decisión no trivial (o un cambio de una anterior) va a DECISIONS.md, y aquí se referencia su `D-NNN`.
3. Las ideas nuevas entran como `[?]` hasta que el usuario las aprueba.
4. Los parámetros de juego se cambian en `src/config.ts`. Si un ajuste cambia el diseño, va también a DECISIONS.md.
