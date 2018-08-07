/// Interface of HexagonScreens
class HexagonScreen {
  constructor(app) {
    this.app = app;
  }
  enter() {
    throw new Error('Needs to be overwritten by derived implementation');
  }
  leave() {
    throw new Error('Needs to be overwritten by derived implementation');
  }
  getLevel() {
    throw new Error('Needs to be overwritten by derived implementation');
  }
}

class HexagonArrowButton {
  constructor() {
    this.elm = HexagonApp.parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="hexagon-directional-button" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="0" y="5" width="95" height="95"></rect>
        <rect x="5" y="0" width="95" height="95"></rect>
        <path d="M20,50 L35,15 L35,30 L80,30 L80,70 L35,70 L35,85z" fill="black"></path>
      </svg>
    `);
  }
  appendTo(elm) {
    elm.appendChild(this.elm);
  }
  addClass(clazz) {
    this.elm.classList.add(clazz);
  }
}

class HexagonTitleScreen extends HexagonScreen {
  constructor(app) {
    super(app);
    this.elm = HexagonApp.parseHtml(`
      <div class="hexagon-screen-title">
        <h1><span>libre</span><span>hexagon</span></h1>
        <span class="hexagon-title-action">tap to start</span>
      </div>
    `);
    this.leftBtn = new HexagonArrowButton();
    this.leftBtn.addClass('left');
    this.leftBtn.appendTo(this.elm);
    this.rightBtn = new HexagonArrowButton();
    this.rightBtn.addClass('right');
    this.rightBtn.appendTo(this.elm);
    this.elm.addEventListener('click', () => {
      this.app.changeScreen('level-1');
    });

    class Level extends HexagonLevel {
      constructor(game) {
        super();
        this.game = game;
      }
      reset() {
        const state = this.game.getState();
        state.renderConfig.slotColors = [[0.188, 0.188, 0.188], [0.149, 0.149, 0.149]];
        state.renderConfig.obstacleColor = [0.5, 0.5, 0.5];
        state.renderConfig.innerHexagonColor = [0.5, 0.5, 0.5];
        state.renderConfig.outerHexagonColor = [0.5, 0.5, 0.5];
        state.renderConfig.cursorColor = [0.188, 0.188, 0.188];
        state.renderConfig.zoom = 5;
        state.renderConfig.eye = [0, 0.5];
        state.renderConfig.lookAt = [0, 1];
        this.tweens = [
          new HexagonTween(10000, 0, null, (progress) => {
            state.renderConfig.rotation = 1 - progress;
          }),
        ];
      }
      tick(delta) {
        for (let i = 0; i < this.tweens.length; i++)
          this.tweens[i].tick(delta);
      }
    }

    this.level = new Level(app.getGame());
  }
  enter() {
    this.level.reset();
    this.app.getUIContainer().appendChild(this.elm);
  }
  leave() {
    this.elm.remove();
  }
  getLevel() {
    return this.level;
  }
}

class HexagonLevel1 extends HexagonScreen {
  constructor(app) {
    super(app);
    this.obstaclePool = app.getObstaclePool();
    this.elm = HexagonApp.parseHtml(`
      <div class="hexagon-screen-1">
        <span class="hexagon-time-legend">time</span>
        <span class="hexagon-time-value">
          <span class="hexagon-time-seconds"></span>:<span class="hexagon-time-millis"></span>
        </span>
      </div>
    `);
    this.secondsDisplay = this.elm.querySelector('.hexagon-time-seconds');
    this.millisDisplay = this.elm.querySelector('.hexagon-time-millis');
    this.timeUpdater = 0;

    this.slotColor1 = [0.7, 0.7, 0.7];
    this.slotColor2 = [0.6, 0.6, 0.6];

    this.obstacleGens = [
      GenerateSpiral, GenerateReverseSpiral, GenerateRain, GenerateC,
      GenerateLadder, GenerateDoubleTurn, GenerateReverseDoubleTurn,
      GenerateBat, GeneratePot
    ];
    const fullRotationTime = 3000;
    const colorInterpolationDuration = 1000;
    const colorSwapDuration = 1500;
    const timeBetweenObstacles = 0;
    const zoomPeriod = 150;
    const gamestate = app.getGame().getState();
    this.music = app.getGame().getSoundManager().addSound('sound/lukas_hexagon3.mp3');
    this.music.setLooping(true);
    this.tweens = [
      // interpolate slot colors
      new HexagonTween(colorInterpolationDuration, 0, null, (progress) => {
        const brightness = 1 - Math.abs(1 - 2 * progress) * 0.2;
        for (let i = 0; i < this.slotColor1.length; i++) {
          gamestate.renderConfig.slotColors[0][i] = brightness * this.slotColor1[i];
          gamestate.renderConfig.slotColors[1][i] = brightness * this.slotColor2[i];
        }
      }),
      // swap slot colors
      new HexagonTween(colorSwapDuration, 0, null, (progress) => {
        if (progress === 1) {
          const tmp = this.slotColor1;
          this.slotColor1 = this.slotColor2;
          this.slotColor2 = tmp;
        }
      }),
      // generate obstacles
      new HexagonTween(1 /* end asap */, timeBetweenObstacles, null, (progress, state, tween) => {
        if (progress == 1 && gamestate.running) {
          let height = -1;
          const opts = {};
          do {
            const genIdx = Math.floor(Math.random() * this.obstacleGens.length);
            const gen = this.obstacleGens[genIdx];
            height = gen(gamestate, this.obstaclePool, opts);
          } while(height < 0);
          tween.duration = height / gamestate.obstacleSpeed * HexagonConstants.targetTickTime;
        }
      }),
      // interpolate rotation
      new HexagonTween(fullRotationTime, 0, null, (progress) => {
        gamestate.renderConfig.rotation = progress;
      }),
      // zoom
      new HexagonTween(zoomPeriod, 0, {distance : 1}, (progress, state, tween) => {
        if (progress === 1) {
          state.distance = 0.2 + Math.random() * 0.2;
          //tween.cooldown = 200 + Math.random() * 1000;
        }
        const zoommand = (1 - Math.abs(1 - 2 * progress)) * state.distance * 0.2;
        gamestate.renderConfig.zoom = 1 + zoommand;
      }),
      new HexagonTween(2000, 0, null, (progress) => {
        gamestate.renderConfig.eye[0] = ((1 - Math.abs(1 - 2 * progress)) - 0.5) * 0.5;
      })
    ];
  }
  enter() {
    if (this.timeUpdater !== 0)
      throw new Error("Screen lifecycle should assert that timeUpdater is inactive on enter");
    this.reset();
    this.app.getUIContainer().appendChild(this.elm);
    this.timeUpdater = window.setInterval(() => {
      const time = this.app.getGame().getPlayTime();
      this.secondsDisplay.textContent = Math.floor(time / 1000);
      this.millisDisplay.textContent = ('' + Math.floor((time - Math.floor(time / 1000) * 1000) / 10)).padStart(2, '0');
    }, 10);
  }
  leave() {
    this.elm.remove();
    window.clearInterval(this.timeUpdater);
    this.timeUpdater = 0;
  }
  getLevel() {
    return this;
  }
  reset() {
    this.timeSinceRotationStart = 0;

    const cursorColor = [1, 1, 1];
    const cursorShadowColor = [0.3, 0.3, 0.3];
    const innerHexagonColor = [0.5, 0.5, 0.5];
    const outerHexagonColor = [1, 1, 1];
    const obstacleColor = [1, 1, 1];
    const slotColors = [this.slotColor1.slice(0), this.slotColor2.slice(0)];
    const state = this.app.getGame().getState();
    state.renderConfig.cursorColor = cursorColor;
    state.renderConfig.cursorShadowColor = cursorShadowColor;
    state.renderConfig.innerHexagonColor = innerHexagonColor;
    state.renderConfig.outerHexagonColor = outerHexagonColor;
    state.renderConfig.obstacleColor = obstacleColor;
    state.renderConfig.slotColors = slotColors;
    state.renderConfig.eye[1] = -0.5;
    state.renderConfig.lookAt = [0, 0];
    state.obstacleSpeed = 0.008;
    state.cursorSpeed = 0.037;
    this.music.play();
  }
  tick(delta) {
    for (let i = 0; i < this.tweens.length; i++)
      this.tweens[i].tick(delta);
  }
  onStop() {
    this.music.pause();
  }
}

class HexagonApp {
  constructor(container) {
    this.elm = HexagonApp.parseHtml(`
      <div class="hexagon-app">
        <div class="hexagon-ui"></div>
        <canvas class="hexagon-viewport"></canvas>
      </div>
    `);
    container.appendChild(this.elm);
    this.canvas = this.elm.querySelector('.hexagon-viewport');
    this.uiContainer = this.elm.querySelector('.hexagon-ui');
    this.obstaclePool = new HexagonObstaclePool();
    this.game = new HexagonGame(this.canvas, this.elm, this.obstaclePool);
    const restartIfStopped = () => {
      if (!this.game.getState().running)
        this.game.restart();
    };
    this.canvas.addEventListener("mousedown", restartIfStopped);
    this.canvas.addEventListener("touchstart", restartIfStopped);
    this.canvas.addEventListener('keydown', (event) => {
      if (event.code === 'Space')
        restartIfStopped();
    });

    this.screens = {
      'title': new HexagonTitleScreen(this),
      'level-1': new HexagonLevel1(this)
    };
    this.screen = null;
    this.changeScreen('title');
  }
  changeScreen(screenName) {
    if (!this.screens[screenName])
      throw new Error(`Invalid screen name: ${screenName}`);
    if (this.screen)
      this.screen.leave();
    const screen = this.screens[screenName];
    this.game.setLevel(screen.getLevel());
    this.game.restart();
    screen.enter();
    this.screen = screen;
    this.canvas.focus();
  }
  getFPS() {
    return this.game.getFPS();
  }
  getGame() {
    return this.game;
  }
  getUIContainer() {
    return this.uiContainer;
  }
  getObstaclePool() {
    return this.obstaclePool;
  }

  /// Parse html strings containing a single parent tag of arbitrary type
  /// into a corresponding DOM Node including all child tags of the input.
  ///
  /// NOTE: We are aware of DOMParser. However, it is not fool-proof.
  /// I.e., tags that require proper nesting (e.g. tr) will not work with
  /// DOMParser. Refer to https://stackoverflow.com/a/33321421/1468532
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
  static parseSvg(svg) {
    svg = svg.trim();
    let depth = 0;
    if (!svg.startsWith('<svg ') && !svg.startsWith('<svg>')) {
      svg = `<svg>${svg}</svg>`;
      depth = 1;
    }
    let elm = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    while(depth-- > 0)
      elm = elm.lastChild;
    return elm;
  }
}
