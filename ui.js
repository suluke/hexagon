/// Interface of HexagonScreens
class HexagonScreen {
  constructor(app) {
  }
  enter() {
    throw new Error('Needs to be overwritten by derived implementation');
  }
  leave() {
    throw new Error('Needs to be overwritten by derived implementation');
  }
}

/// Interface of HexagonLevels
// FIXME: extends HexagonScreen just a hack until we properly separate code
class HexagonLevel extends HexagonScreen {
  getState() {
    throw new Error('Needs to be overwritten by derived implementation');
  }
  tick(delta) {
    throw new Error('Needs to be overwritten by derived implementation');
  }
}

class HexagonLevel1 extends HexagonLevel {
  constructor(app) {
    super();
    this.app = app;
    this.obstaclePool = this.app.getObstaclePool();
    this.elm = HexagonApp.parseHtml(`
      <div class="hexagon-screen-1">
        <span class="hexagon-time-legend">time</span>
        <span class="hexagon-time-value">
          <span class="hexagon-time-seconds"></span>:<span class="hexagon-time-millis"></span>
        </span>
      </div>
    `);
    this.app.getUIContainer().appendChild(this.elm);
    this.secondsDisplay = this.elm.querySelector('.hexagon-time-seconds');
    this.millisDisplay = this.elm.querySelector('.hexagon-time-millis');

    const renderConfig = new HexagonRenderConfig();
    this.state = new HexagonState(renderConfig);
    this.slotColor1 = [0.7, 0.7, 0.7];
    this.slotColor2 = [0.6, 0.6, 0.6];

    this.obstacleGens = [
      GenerateSpiral, GenerateReverseSpiral, GenerateRain, GenerateC,
      GenerateLadder, GenerateDoubleTurn, GenerateBat, GeneratePot
    ];
    const fullRotationTime = 3000;
    const colorInterpolationDuration = 1000;
    const colorSwapDuration = 1500;
    const timeBetweenObstacles = 0;
    const zoomPeriod = 1500;
    const { state } = this;
    this.tweens = [
      // interpolate slot colors
      new HexagonTween(colorInterpolationDuration, 0, (progress) => {
        const brightness = 1 - Math.abs(1 - 2 * progress) * 0.2;
        for (let i = 0; i < this.slotColor1.length; i++) {
          state.renderConfig.slotColors[0][i] = brightness * this.slotColor1[i];
          state.renderConfig.slotColors[1][i] = brightness * this.slotColor2[i];
        }
      }),
      // swap slot colors
      new HexagonTween(colorSwapDuration, 0, (progress) => {
        if (progress === 1) {
          const tmp = this.slotColor1;
          this.slotColor1 = this.slotColor2;
          this.slotColor2 = tmp;
        }
      }),
      // generate obstacles
      new HexagonTween(1 /* end asap */, timeBetweenObstacles, (progress, tween) => {
        if (progress == 1 && state.running) {
          let height = -1;
          const opts = {};
          do {
            const genIdx = Math.floor(Math.random() * this.obstacleGens.length);
            const gen = this.obstacleGens[genIdx];
            height = gen(state, this.obstaclePool, opts);
          } while(height < 0);
          tween.duration = height / state.obstacleSpeed * HexagonConstants.targetTickTime;
        }
      }),
      // interpolate rotation
      new HexagonTween(fullRotationTime, 0, (progress) => {
        state.renderConfig.rotation = progress;
      }),
      // zoom
      new HexagonTween(zoomPeriod, 0, (progress) => {
        const zoommand = (1 - Math.abs(1 - 2 * progress)) * 0.3;
        state.renderConfig.zoom = 1 + zoommand;
      })
    ];
    this.reset();
  }
  enter() {
    const timeUpdater = window.setInterval(() => {
      const time = this.app.getGame().getPlayTime();
      this.secondsDisplay.textContent = Math.floor(time / 1000);
      this.millisDisplay.textContent = ('' + Math.floor((time - Math.floor(time / 1000) * 1000) / 10)).padStart(2, '0');
    }, 10);
  }
  reset() {
    this.timeSinceRotationStart = 0;

    const cursorColor = [1, 1, 1];
    const cursorShadowColor = [0.3, 0.3, 0.3];
    const innerHexagonColor = [0.5, 0.5, 0.5];
    const outerHexagonColor = [1, 1, 1];
    const obstacleColor = [1, 1, 1];
    const slotColors = [this.slotColor1.slice(0), this.slotColor2.slice(0)];
    this.state.renderConfig.cursorColor = cursorColor;
    this.state.renderConfig.cursorShadowColor = cursorShadowColor;
    this.state.renderConfig.innerHexagonColor = innerHexagonColor;
    this.state.renderConfig.outerHexagonColor = outerHexagonColor;
    this.state.renderConfig.obstacleColor = obstacleColor;
    this.state.renderConfig.slotColors = slotColors;
    this.state.obstacleSpeed = 0.008;
    this.state.cursorSpeed = 0.037;
  }
  tick(delta) {
    const { state } = this;
    for (let i = 0; i < this.tweens.length; i++)
      this.tweens[i].tick(delta);
  }
  getState() {
    return this.state;
  }
}

class HexagonApp {
  constructor(container) {
    this.elm = HexagonApp.parseHtml(`
      <div class="hexagon-app">
        <canvas class="hexagon-viewport"></canvas>
      </div>
    `);
    container.appendChild(this.elm);
    this.canvas = this.elm.querySelector('.hexagon-viewport');
    this.obstaclePool = new HexagonObstaclePool();
    this.level = new HexagonLevel1(this);
    this.game = new HexagonGame(this.canvas, this.level, this.obstaclePool);
    this.level.enter();
    const restartIfStopped = () => {
      if (!this.level.getState().running)
        this.game.restart();
    };
    this.canvas.addEventListener("mousedown", restartIfStopped);
    this.canvas.addEventListener("touchstart", restartIfStopped);
    this.canvas.addEventListener('keydown', (event) => {
      if (event.code === 'Space')
        restartIfStopped();
    });
  }
  static parseHtml(html) {
    // eslint-disable-next-line no-param-reassign
    html = html.trim();
    /* code adapted from jQuery */
    const wrapper = (depth, open, close) => ({ depth, open, close });
    const wrapMap = {
      option: wrapper(1, "<select multiple='multiple'>", '</select>'),
      legend: wrapper(1, '<fieldset>', '</fieldset>'),
      area:   wrapper(1, '<map>', '</map>'),
      param:  wrapper(1, '<object>', '</object>'),
      thead:  wrapper(1, '<table>', '</table>'),
      tr:     wrapper(2, '<table><tbody>', '</tbody></table>'),
      col:    wrapper(2, '<table><tbody></tbody><colgroup>', '</colgroup></table>'),
      td:     wrapper(3, '<table><tbody><tr>', '</tr></tbody></table>'),

      // IE6-8 can't serialize link, script, style, or any html5 (NoScope) tags,
      // unless wrapped in a div with non-breaking characters in front of it.
      _default: wrapper(1, '<div>', '</div>')
    };
    wrapMap.optgroup = wrapMap.option;
    wrapMap.tbody = wrapMap.thead;
    wrapMap.tfoot = wrapMap.thead;
    wrapMap.colgroup = wrapMap.thead;
    wrapMap.caption = wrapMap.thead;
    wrapMap.th = wrapMap.td;
    let element = document.createElement('div');
    const match = /<\s*(\w+).*?>/g.exec(html);
    if (match != null) {
      const tag = match[1];
      const wrap = wrapMap[tag] || wrapMap._default;
      // eslint-disable-next-line no-param-reassign
      html = `${wrap.open}${html}${wrap.close}`;
      element.innerHTML = html;
      // Descend through wrappers to the right content
      const depth = wrap.depth + 1;
      for (let d = 0; d < depth; d++) {
        if (element.firstChild !== element.lastChild) {
          throw new Error(
            'util.parseHtml requires one single top level element.' +
            'NOTE: This error might also occur if your tag structure ' +
            'is nested illegaly.'
          );
        }
        element = element.lastChild;
      }
    } else {
      // if only text is passed
      element.innerHTML = html;
      element = element.lastChild;
    }

    return element;
  }
  getFPS() {
    return this.game.getFPS();
  }
  getGame() {
    return this.game;
  }
  getUIContainer() {
    return this.elm;
  }
  getObstaclePool() {
    return this.obstaclePool;
  }
}
