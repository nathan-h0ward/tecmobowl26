import { Game } from './game.js';
import { Input } from './input.js';
import { UI } from './ui.js';

const canvas = document.getElementById('game');
const context = canvas.getContext('2d');
context.imageSmoothingEnabled = false;

const input = new Input(canvas);
const ui = new UI();
const game = new Game(canvas, context, input, ui);
ui.bindGame(game);

let lastTime = performance.now();

function loop(now) {
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  game.update(delta);
  game.render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

window.addEventListener('resize', () => game.handleResize());
window.addEventListener('orientationchange', () => game.handleResize());

// Prevent page scrolling during gameplay.
document.addEventListener(
  'touchmove',
  (event) => {
    event.preventDefault();
  },
  { passive: false }
);
