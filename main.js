const game = new HexagonApp(document.getElementById('hexagon-container'));
const fpsUpdater = window.setInterval(() => {
  document.title = `Hexagon (${game.getFPS()} fps)`;
}, 2000);

// Implement some page navigation
if (window.location.hash !== '')
  game.changeScreen(window.location.hash.substring(1));
let changeTriggered = false;
game.addScreenChangeListener((screenName) => {
  if (changeTriggered) {
    changeTriggered = false;
    return;
  }
  if (screenName !== 'title')
    window.location.hash = screenName;
  else
    history.pushState("", document.title, window.location.pathname
                      + window.location.search);
});
window.onhashchange = function(...args) {
  // typically called when navigating back
  changeTriggered = true;
  if (window.location.hash !== '')
    game.changeScreen(window.location.hash.substring(1));
  else
    game.changeScreen('title');
}
