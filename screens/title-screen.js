class HexagonTitleScreen extends HexagonScreen {
  constructor(app) {
    super(app);
    this.elm = HexagonApp.parseHtml(`
      <div class="hexagon-screen-title">
        <h1><span>libre</span><span>hexagon</span></h1>
        <span class="hexagon-title-action">start game</span>
      </div>
    `);
    this.actionDisplay = this.elm.querySelector('.hexagon-title-action');
    this.actions = [
      { text: 'start game', action: () => { app.changeScreen('level-1'); } },
      { text: 'options', action: () => { app.changeScreen('settings'); } },
      { text: 'achievements', action: () => { app.changeScreen('level-1'); } },
      { text: 'credits', action: () => { app.changeScreen('level-1'); } }
    ];
    this.action = 0;
    this.forceUserInteraction = false;
    this.contentFragment = this.prepareContents();
    this.elm.appendChild(this.contentFragment);
    const soundMgr = app.getGame().getSoundManager();
    this.startupSound = soundMgr.addSound('data/sounds/superhexagon.mp3');
    // play() may fail, but we work around that using the engine's forceUserInteraction message
    this.startupSound.play().catch(function(e) { console.warn(e); });
    app.addKeyListener((keysDown) => this.onKeyEvent(keysDown));
    this.elm.addEventListener('click', () => this.onClick());

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
  onKeyEvent(keysDown) {
    if (!this.isActive() || this.forceUserInteraction)
      return;
    if (keysDown.has('ArrowLeft'))
      this.leftBtn.trigger();
    if (keysDown.has('ArrowRight'))
      this.rightBtn.trigger();
    if (keysDown.has('Space'))
      this.actions[this.action].action();
  }
  onClick() {
    if (this.forceUserInteraction) {
      this.forceUserInteraction = false;
      this.elm.appendChild(this.contentFragment);
      this.actionDisplay.textContent = this.actions[this.action].text;
      this.app.receiveMessage(new HexagonMessage('userInteractionForced', null));
      this.startupSound.play().catch((e) => { console.warn(e); console.log('Did not work :('); });
    } else
      this.actions[this.action].action();
  }
  prepareContents() {
    const soundMgr = this.app.getGame().getSoundManager();
    const btnClick = soundMgr.addSound('data/sounds/menuchoose.mp3');
    const fragment = document.createElement('div');
    // action cycle carousel
    const actions = this.actions;
    const actionDisplay = this.actionDisplay;
    this.leftBtn = new HexagonArrowButton(btnClick);
    this.leftBtn.addListener(() => {
      this.action = (this.action - 1 + actions.length) % actions.length;
      actionDisplay.textContent = actions[this.action].text;
    });
    this.leftBtn.addClass('left');
    this.leftBtn.appendTo(fragment);
    this.rightBtn = new HexagonArrowButton(btnClick);
    this.rightBtn.addListener(() => {
      this.action = (this.action + 1) % actions.length;
      actionDisplay.textContent = actions[this.action].text;
    });
    this.rightBtn.addClass('right');
    this.rightBtn.appendTo(fragment);
    // top edge buttons
    const app = this.app;
    this.topLeftBtn = new HexagonTopEdgeButton('fullscreen', false);
    this.topLeftBtn.addClass('left');
    this.topLeftBtn.appendTo(fragment);
    this.topLeftBtn.addListener(() => {
      app.toggleFullscreen();
    });
    app.addFullscreenChangeListener(() => {
      if (app.isFullScreen())
        this.topLeftBtn.setText('windowed');
      else
        this.topLeftBtn.setText('fullscreen');
    });
    const githubLink = HexagonApp.parseHtml(`
      <a href="https://github.com/suluke/hexagon">github</a>
    `);
    this.topRightBtn = new HexagonTopEdgeButton(githubLink, true);
    this.topRightBtn.addClass('right');
    this.topRightBtn.appendTo(fragment);
    return fragment;
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
  receiveMessage(msg) {
    switch(msg.getName()) {
      case 'forceUserInteraction': {
        this.elm.removeChild(this.contentFragment);
        this.actionDisplay.textContent = 'tap to begin';
        this.forceUserInteraction = true;
        break;
      }
      default:
        console.warn('Title Screen: No message handler');
    }
  }
}
