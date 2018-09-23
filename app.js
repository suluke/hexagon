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
  isActive() {
    return this.app.getCurrentScreen() === this;
  }
}

class HexagonAbstractButton {
  constructor(elm) {
    this.elm = elm;
    this.listeners = [];
    const trigger = (evt) => {
      evt.stopPropagation();
      this.trigger();
    };
    this.elm.addEventListener('click', trigger);
    this.elm.addEventListener('touchstart', trigger);
  }
  appendTo(elm) {
    elm.appendChild(this.elm);
  }
  addClass(clazz) {
    this.elm.classList.add(clazz);
  }
  addListener(listener) {
    this.listeners.push(listener);
  }
  trigger() {
    for (let i = 0; i < this.listeners.length; i++)
      this.listeners[i]();
  }
}

class HexagonArrowButton extends HexagonAbstractButton {
  constructor() {
    super(HexagonApp.parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="hexagon-directional-button" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="0" y="5" width="95" height="95"></rect>
        <rect x="5" y="0" width="95" height="95"></rect>
        <path d="M20,50 L35,15 L35,30 L80,30 L80,70 L35,70 L35,85z" fill="black"></path>
      </svg>
    `));
  }
}

class HexagonTopEdgeButton extends HexagonAbstractButton {
  constructor(text, right) {
    super(HexagonApp.parseHtml(`
      <div class="hexagon-top-edge-button">
        <span>${text}</span>
      </div>
    `));
    const backgroundLeft = `
      <svg xmlns="http://www.w3.org/2000/svg"
           xmlns:xlink="http://www.w3.org/1999/xlink"
           class="hexagon-top-edge-button-bg" viewBox="0 0 200 100"
           preserveAspectRatio="xMaxYMax slice">
        <polygon points="-100,0 200,0 150,100 -100,100"/>
      </svg>
    `;
    const backgroundRight = `
      <svg xmlns="http://www.w3.org/2000/svg"
           xmlns:xlink="http://www.w3.org/1999/xlink"
           class="hexagon-top-edge-button-bg" viewBox="0 0 200 100"
           preserveAspectRatio="xMinYMax slice">
        <polygon points="0,0 300,0 300,100 50,100"/>
      </svg>
    `;
    this.background = HexagonApp.parseSvg(right? backgroundRight : backgroundLeft);
    this.elm.insertBefore(this.background, this.elm.firstChild);
  }
  setText(text) {
    this.elm.querySelector('span').textContent = text;
  }
}

class HexagonTitleScreen extends HexagonScreen {
  constructor(app) {
    super(app);
    this.elm = HexagonApp.parseHtml(`
      <div class="hexagon-screen-title">
        <h1><span>libre</span><span>hexagon</span></h1>
        <span class="hexagon-title-action">start game</span>
      </div>
    `);
    const actionDisplay = this.elm.querySelector('.hexagon-title-action');
    const actions = [
      { text: 'start game', action: () => { this.app.changeScreen('level-1'); } },
      { text: 'options', action: () => { this.app.changeScreen('settings'); } },
      { text: 'achievements', action: () => { this.app.changeScreen('level-1'); } },
      { text: 'credits', action: () => { this.app.changeScreen('level-1'); } }
    ];
    this.action = 0;
    this.leftBtn = new HexagonArrowButton();
    this.leftBtn.addListener(() => {
      this.action = (this.action - 1 + actions.length) % actions.length;
      actionDisplay.textContent = actions[this.action].text;
    });
    this.leftBtn.addClass('left');
    this.leftBtn.appendTo(this.elm);
    this.rightBtn = new HexagonArrowButton();
    this.rightBtn.addListener(() => {
      this.action = (this.action + 1) % actions.length;
      actionDisplay.textContent = actions[this.action].text;
    });
    this.rightBtn.addClass('right');
    this.rightBtn.appendTo(this.elm);
    this.elm.addEventListener('click', () => {
      actions[this.action].action();
    });
    app.addKeyListener((keysDown) => {
      if (!this.isActive())
        return;
      if (keysDown.has('ArrowLeft'))
        this.leftBtn.trigger();
      if (keysDown.has('ArrowRight'))
        this.rightBtn.trigger();
      if (keysDown.has('Space'))
        actions[this.action].action();
    });

    this.topLeftBtn = new HexagonTopEdgeButton('fullscreen', false);
    this.topLeftBtn.addClass('left');
    this.topLeftBtn.appendTo(this.elm);
    this.topLeftBtn.addListener(() => {
      const elm = app.getRootElement();
      app.toggleFullscreen();
    });
    app.addFullscreenChangeListener(() => {
      if (app.isFullScreen())
        this.topLeftBtn.setText('windowed');
      else
        this.topLeftBtn.setText('fullscreen');
    });
    this.topRightBtn = new HexagonTopEdgeButton('github', true);
    this.topRightBtn.addClass('right');
    this.topRightBtn.appendTo(this.elm);

    this.startupSound = app.getGame().getSoundManager().addSound('data/sounds/superhexagon.mp3');
    this.startupSound.play();

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

class HexagonSettingsScreen extends HexagonScreen {
  constructor(app) {
    super(app);
    this.elm = HexagonApp.parseHtml(`
      <div class="hexagon-screen-settings">
        <h1>options</h1>
        <ul>
          <li class="active" tabindex="0"><button type="button">change to fullscreen</button></li>
          <li tabindex="0"><label>change sounds volume <input type="range" min="0" max="100" value="50"/></label></li>
          <li tabindex="0"><label>change music volume <input type="range" min="0" max="100" value="50"/></label></li>
          <li tabindex="0"><button type="button">delete records</button></li>
        </ul>
      </div>
    `);
    app.addKeyListener((keysDown) => {
      if (keysDown.has('Escape'))
        this.app.changeScreen('title');
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
    const game = app.getGame();
    const gamestate = game.getState();
    const soundManager = game.getSoundManager();
    this.music = soundManager.addSound('data/music/music0.mp3');
    this.music.setLooping(true);
    this.beginSound = soundManager.addSound('data/sounds/begin.mp3');
    this.gameoverSound = soundManager.addSound('data/sounds/gameover.mp3');

    const restartIfStopped = () => {
      if (this.isActive() && !game.getState().running)
        game.restart();
    };
    const canvas = app.getCanvas();
    canvas.addEventListener('mousedown', restartIfStopped);
    canvas.addEventListener('touchstart', restartIfStopped);
    app.addKeyListener((keysDown) => {
      if (keysDown.has('Space'))
        restartIfStopped();
      if (keysDown.has('Escape'))
        app.changeScreen('title');
    });

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
  isActive() {
    return this.elm.parentNode !== null;
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
    this.music.stop();
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
    this.beginSound.play();
  }
  tick(delta) {
    for (let i = 0; i < this.tweens.length; i++)
      this.tweens[i].tick(delta);
  }
  onStop() {
    this.music.pause();
    this.gameoverSound.play();
  }
}

class HexagonApp {
  constructor(container) {
    this.elm = HexagonApp.parseHtml(`
      <div class="hexagon-app">
        <div class="hexagon-ui"></div>
        <canvas class="hexagon-viewport" tabindex=0></canvas>
      </div>
    `);
    container.appendChild(this.elm);
    this.canvas = this.elm.querySelector('.hexagon-viewport');
    this.uiContainer = this.elm.querySelector('.hexagon-ui');
    this.obstaclePool = new HexagonObstaclePool();
    this.game = new HexagonGame(this.elm, this.canvas, this.elm, this.obstaclePool);

    this.fullscreenChangeListeners = [];
    let isFullScreen = this.isFullScreen();
    window.addEventListener('resize', (event) => {
      if (isFullScreen !== this.isFullScreen()) {
        isFullScreen = this.isFullScreen();
        for (let i = 0; i < this.fullscreenChangeListeners.length; i++)
          this.fullscreenChangeListeners[i]();
      }
    });

    this.screens = {
      'title': new HexagonTitleScreen(this),
      'level-1': new HexagonLevel1(this),
      'settings': new HexagonSettingsScreen(this)
    };
    this.screen = null;
    this.screenName = null;
    this.screenChangeListeners = [];
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
    for (let i = 0; i < this.screenChangeListeners.length; i++)
      this.screenChangeListeners[i](screenName, this.screenName);
    this.screen = screen;
    this.screenName = screenName;
    this.canvas.focus();
  }
  getFPS() {
    return this.game.getFPS();
  }
  getGame() {
    return this.game;
  }
  getCanvas() {
    return this.canvas;
  }
  getRootElement() {
    return this.elm;
  }
  getUIContainer() {
    return this.uiContainer;
  }
  getObstaclePool() {
    return this.obstaclePool;
  }
  addKeyListener(listener) {
    this.game.addKeyListener(listener);
  }
  addScreenChangeListener(listener) {
    this.screenChangeListeners.push(listener);
  }
  getCurrentScreenName() {
    return this.screenName;
  }
  getCurrentScreen() {
    return this.screen;
  }
  toggleFullscreen(onEnter, onLeave, onError) {
    const element = this.getRootElement();
    if (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    ) {
      if (document.exitFullscreen)
        document.exitFullscreen();
      else if (document.mozCancelFullScreen)
        document.mozCancelFullScreen();
      else if (document.webkitExitFullscreen)
        document.webkitExitFullscreen();
      else if (document.msExitFullscreen)
        document.msExitFullscreen();
      else {
        if (onError)
          onError();
        return;
      }
      if (onLeave)
        onLeave();
    } else {
      if (element.requestFullscreen)
        element.requestFullscreen();
      else if (element.mozRequestFullScreen)
        element.mozRequestFullScreen();
      else if (element.webkitRequestFullscreen)
        element.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
      else if (element.msRequestFullscreen)
        element.msRequestFullscreen();
      else {
        if (onError)
          onError();
        return;
      }
      if (onEnter)
        onEnter();
    }
  }
  isFullScreen() {
    const names = ['fullscreenElement', 'webkitFullscreenElement',
                   'mozFullScreenElement', 'msFullscreenElement'];
    for (let i = 0; i < names.length; i++) {
      console.log(names[i]);
      console.log(document[names[i]]);
      if (document[names[i]])
        return this.getRootElement() === document[names[i]];
    }
    return false;
  }
  addFullscreenChangeListener(listener) {
    this.fullscreenChangeListeners.push(listener);
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
