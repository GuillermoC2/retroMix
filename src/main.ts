import '@fontsource/press-start-2p';
import './style.css';
import { Game } from './core/Game';
import { MazeRunMode } from './maze-run/MazeRunMode';

const game = new Game(document.getElementById('app')!);
game.ctx.modes.push(new MazeRunMode(game.ctx));
game.start();

// Solo en desarrollo: acceso desde la consola para depurar.
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
