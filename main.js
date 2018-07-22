const game = new HexagonApp(document.getElementById('hexagon-container'));
const fpsUpdater = window.setInterval(() => {
  document.title = `Hexagon (${game.getFPS()} fps)`;
}, 2000);
