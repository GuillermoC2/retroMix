import '@fontsource/press-start-2p';
import './style.css';
import { CONFIG } from './config';
import { Game } from './core/Game';
import { MazeRunMode } from './maze-run/MazeRunMode';

const game = new Game(document.getElementById('app')!);
game.ctx.modes.push(new MazeRunMode(game.ctx));
game.start();

// Solo escritorio: en pantallas de móvil (o ventanas pequeñas o verticales) se avisa y se detiene el juego.
const blocker = document.createElement('div');
blocker.className = 'unsupported';
blocker.innerHTML = `
  <div class="unsupported-box">
    <div class="unsupported-title">RETROMIX</div>
    <p>NO SE PUEDE JUGAR EN MOVIL</p>
    <p class="unsupported-hint">JUEGA EN UN ORDENADOR CON TECLADO.<br>SI YA ESTAS EN UNO, AGRANDA LA VENTANA.</p>
  </div>`;
document.body.appendChild(blocker);
const unsupported = window.matchMedia(CONFIG.ui.unsupportedScreen);
const applyScreenCheck = () => {
  game.suspended = unsupported.matches;
  blocker.style.display = unsupported.matches ? '' : 'none';
};
unsupported.addEventListener('change', applyScreenCheck);
applyScreenCheck();

// Solo en desarrollo: acceso desde la consola para depurar.
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
