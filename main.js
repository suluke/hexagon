const HexagonConstants = {
  cursorY: 0.05,
  cursorW: 0.1,
  cursorH: 0.015,
  godMode: false,
  targetTickTime: Math.round(1 / 60 * 1000)
};

// begin game model
class HexagonObstacle {
  constructor(distance, height) {
    this.distance = distance;
    this.height = height;
  }
}

class HexagonSlot {
  constructor() {
    this.obstacles = [];
    this.width = 1.0;
  }
}

class HexagonRenderConfig {
  constructor() {
    this.cursorColor1 = null;
    this.cursorColor2 = null;
    this.obstacleColor = null;
    this.slotColors = null;
    this.rotation = 0;
    this.zoom = 1;
  }
}

class HexagonState {
  constructor(renderConfig) {
    this.running = true;
    this.position = 1 / 12;
    this.obstacleSpeed = 0.005;
    this.cursorSpeed = 0.03;
    this.slots = new Array(6).fill(1).map(i => new HexagonSlot());
    this.renderConfig = renderConfig;
  }
  getSlotWidthSum() {
    return this.slots.reduce((acc, slot) => acc + slot.width, 0);
  }
  getActiveSlotIndices() {
    return this.slots.reduce((acc, slot, idx) => {
      if (slot.width > 0)
        acc.push(idx);
      return acc;
    }, []);
  }
  getCurrentSlotIdx(position = this.position) {
    const activeSlots = this.getActiveSlotIndices();
    const slotWidthSum = this.getSlotWidthSum();
    let s = 0; // the index of the slot we're on according to `position`
    for (let x = 0; s < activeSlots.length; s++) {
      x += this.slots[activeSlots[s]].width / slotWidthSum;
      if (position < x)
        break;
    }
    if (s >= activeSlots.length)
      throw new Error(`target slot out of bounds (${s}/${activeSlots.length})`);
    return activeSlots[s];
  }
}
// end game model

/// All things graphics
class HexagonRenderer {
  constructor(canvas, gamestate) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true, depth: false });
    if (!gl) {
      throw new Error('WebGL not working');
    }
    this.gl = gl;
    this.gamestate = gamestate;
    this.config = gamestate.renderConfig;
    this.program = this.createProgram();
    this.vertexBuffer = gl.createBuffer();
    this.zoom = gl.canvas.height > gl.canvas.width ? gl.canvas.height / gl.canvas.width : 1;
    window.addEventListener('resize', (event) => {
      const W  = gl.canvas.clientWidth;
      const H = gl.canvas.clientHeight;
      if (gl.canvas.width  !== W ||
          gl.canvas.height !== H) {
        gl.canvas.width  = W;
        gl.canvas.height = H;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        this.zoom = gl.canvas.height > gl.canvas.width ? gl.canvas.height / gl.canvas.width : 1
      }
    });

    gl.useProgram(this.program);
  }

  render() {
    const { config, gamestate, gl, program } = this;
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const aspectLoc = gl.getUniformLocation(program, 'aspect');
    gl.uniform1f(aspectLoc, gl.canvas.width / gl.canvas.height);
    const rotationLoc = gl.getUniformLocation(program, 'rotation');
    gl.uniform1f(rotationLoc, config.rotation);
    const zoomLoc = gl.getUniformLocation(program, 'zoom');
    gl.uniform1f(zoomLoc, this.zoom * config.zoom);
    
    // render slots
    this.updateVertexBuffer();
    // gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer); // not needed
    const vertexLoc = gl.getAttribLocation(program, 'vertex');
    gl.vertexAttribPointer(vertexLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vertexLoc);

    const colorLoc = gl.getUniformLocation(program, 'color');
    let offset = 3;
    for (let i = 0; i < gamestate.slots.length; i++) {
      gl.uniform3f(colorLoc, ...config.slotColors[i % config.slotColors.length]);
      gl.drawArrays(gl.TRIANGLE_STRIP, offset, 4);
      offset += 4;
    }
    // render obstacles
    if (offset !== 3 + 4 * gamestate.slots.length)
      throw new Error('Offset into vertices not as expected');
    const obstacleCount = gamestate.slots.reduce((acc, slot) => { return acc + slot.obstacles.length; }, 0);
    gl.uniform3f(colorLoc, ...config.obstacleColor);
    for (let i = 0; i < obstacleCount; i++) {
      gl.drawArrays(gl.TRIANGLE_STRIP, offset, 4);
      offset += 4;
    }
    // render cursor
    gl.uniform3f(colorLoc, ...config.cursorColor1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.flush();
  }

  updateVertexBuffer() {
    const { gamestate, gl } = this;
    const vertices = [];
    // create cursor vertices
    const { cursorH, cursorW, cursorY } = HexagonConstants;
    vertices.push(gamestate.position - cursorW / 2, cursorY - cursorH);
    vertices.push(gamestate.position + cursorW / 2, cursorY - cursorH);
    vertices.push(gamestate.position, cursorY);
    // create slot vertices
    const slotWidthSum = gamestate.getSlotWidthSum();
    let x = 0;
    for (let i = 0; i < gamestate.slots.length; i++) {
      vertices.push(x, 0);
      vertices.push(x, 1);
      x += gamestate.slots[i].width / slotWidthSum;
      vertices.push(x, 0);
      vertices.push(x, 1);
    }
    // create obstacle vertices
    x = 0;
    for (let s = 0; s < gamestate.slots.length; s++) {
      const slot = gamestate.slots[s];
      const slotWidth = slot.width / slotWidthSum;
      for (let o = 0; o < slot.obstacles.length; o++) {
        const obstacle = slot.obstacles[o];
        vertices.push(x, Math.max(obstacle.distance, 0));
        vertices.push(x, obstacle.distance + obstacle.height);
        vertices.push(x + slotWidth, Math.max(obstacle.distance, 0));
        vertices.push(x + slotWidth, obstacle.distance + obstacle.height);
      }
      x += slotWidth;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,
                  new Float32Array(vertices),
                  gl.STATIC_DRAW);
  }

  createProgram() {
    const { gl } = this;
    const vsSource = `
      precision mediump float;
      attribute vec4 vertex;
      uniform float aspect;
      uniform float rotation;
      uniform float zoom;

      float PI = 3.14159265359;

      void main() {
        float r = 1. / cos(PI / 3.);
        float alpha = fract(vertex.x - 1. / 12. + 1. + rotation) * 2. * PI;
        vec4 pos;
        pos.x = sin(alpha) * r;
        pos.y = cos(alpha) * r * aspect;
        pos = pos * vertex.y * zoom;
        pos.z = vertex.z;
        pos.a = vertex.a;
        gl_Position = pos / 2.0;
      }
    `;
    const fsSource = `
      precision mediump float;
      uniform vec3 color;

      void main() {
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    const vertexShader = this.loadShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = this.loadShader(gl.FRAGMENT_SHADER, fsSource);
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      throw new Error(`Unable to initialize the shader program: ${gl.getProgramInfoLog(shaderProgram)}`);
    }
    return shaderProgram;
  }

  loadShader(type, source) {
    const { gl } = this;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`An error occurred compiling shader: ${log}`);
    }
    return shader;
  }
}

/// All things input
class HexagonControls {
  constructor(game, gamestate, canvas) {
    canvas.tabIndex = 1000;
    canvas.focus();
    this.game = game;
    this.gamestate = gamestate;
    this.keysDown = new Set();
    this.touchLeft = false;
    this.touchRight = false;
    canvas.addEventListener('keydown', (event) => {
      this.keysDown.add(event.code);
    });
    canvas.addEventListener('keyup', (event) => {
      this.keysDown.delete(event.code);
    });
    let isDown = false;
    const touchDown = (event) => {
      event.preventDefault();
      if (event.changedTouches)
        event = event.changedTouches[0];
      isDown = true;
      if (event.clientX < canvas.offsetWidth / 2)
        this.touchLeft = true;
      else
        this.touchRight = true;
    };
    const touchMove = (event) => {
      event.preventDefault();
      if (event.changedTouches)
        event = event.changedTouches[0];
      if (isDown) {
        this.touchLeft = this.touchRight = false;
        if (event.clientX < canvas.offsetWidth / 2)
          this.touchLeft = true;
        else
          this.touchRight = true;
      }
    };
    const touchEnd = (event) => {
      event.preventDefault();
      isDown = false;
      this.touchLeft = false;
      this.touchRight = false;
    };
    canvas.addEventListener("mousedown", touchDown);
    canvas.addEventListener("mousemove", touchMove);
    canvas.addEventListener("mouseup", touchEnd);
    canvas.addEventListener("touchstart", touchDown);
    canvas.addEventListener("touchmove", touchMove);
    canvas.addEventListener("touchend", touchEnd);
  }
  tick(delta) {
    const { gamestate, keysDown } = this;
    if (!gamestate.running) {
      if (keysDown.has('Space') || this.touchLeft || this.touchRight)
        this.game.restart();
      return;
    }
    const effect = delta / HexagonConstants.targetTickTime;
    const left = keysDown.has('ArrowLeft') || this.touchLeft;
    const right = keysDown.has('ArrowRight') || this.touchRight;
    if ((left || right) && !(left && right)) {
      const move = gamestate.cursorSpeed * effect;
      const sign = left ? -1 : 1;
      let newpos = gamestate.position + move * sign;
      const wrapcorrection = newpos > 1 ? -1 : (newpos < 0 ? 1 : 0);
      newpos += wrapcorrection;
      // Check for sideways collisions
      const activeSlots = gamestate.getActiveSlotIndices();
      const slotWidthSum = gamestate.getSlotWidthSum();
      let s = 0; // the index of the slot we *should* move onto in activeSlots
      for (let x = 0; s < activeSlots.length; s++) {
        x += gamestate.slots[activeSlots[s]].width / slotWidthSum;
        if (newpos < x)
          break;
      }
      if (s >= activeSlots.length)
        throw new Error(`target slot out of bounds (${s}/${activeSlots.length})`);
      const targetSlot = gamestate.slots[activeSlots[s]];
      const { cursorY } = HexagonConstants;
      for (let o = 0; o < targetSlot.obstacles.length; o++) {
        const obstacle = targetSlot.obstacles[o];
        if (obstacle.distance <= cursorY && obstacle.distance + obstacle.height > cursorY) {
          // can't move here
          s = (s - sign + activeSlots.length) % activeSlots.length;
          const slotLeft = activeSlots.reduce((acc, idx) => (idx < s ? acc + gamestate.slots[activeSlots[idx]].width : acc), 0);
          newpos = slotLeft / slotWidthSum;
          if (right)
            newpos += gamestate.slots[activeSlots[s]].width / slotWidthSum - 0.0001;
          break;
        }
      }
      gamestate.position = newpos;
    }
  }
}

function GenerateSpirals(state, { obstacleHeight = 0.05, obstacleDist = 0.03, numLines = 10, initialY = 1.0, reverse = false } = {}) {
  const activeSlots = state.getActiveSlotIndices();
  if (activeSlots.length % 3 !== 0) {
    return -1;
  }
  let y = initialY;
  const r = reverse ? -1 : 1;
  for (let line = 0; line < numLines; line++) {
    for (let i = 0; i < activeSlots.length; i += 3) {
      state.slots[activeSlots[(i + line * r + numLines) % activeSlots.length]].obstacles.push(new HexagonObstacle(y, obstacleHeight));
    }
    y += obstacleDist;
  }
  y -= obstacleDist;
  const duration = y / state.obstacleSpeed * HexagonConstants.targetTickTime;
  return duration;
}
function GenerateReverseSpirals(state, options) {
  options.reverse = !options.reverse;
  return GenerateSpirals(state, options);
}
function GenerateCheckerBoard(state, { obstacleHeight = 0.05, lineDist = 0.15, numLines = 5, initialY = 1.0 } = {}) {
  let y = initialY;
  for (let line = 0; line < numLines; line++) {
    for (let s = 0; s < state.slots.length; s++) {
      if ((s % 2) ^ (line % 2) === 0) {
        state.slots[s].obstacles.push(new HexagonObstacle(y, obstacleHeight));
      }
    }
    y += lineDist;
  }
  y -= (lineDist - obstacleHeight);
  const duration = y / state.obstacleSpeed * HexagonConstants.targetTickTime;
  return duration;
}

class HexagonTween {
  constructor(duration, cooldown, callback) {
    this.duration = duration;
    this.cooldown = cooldown;
    this.callback = callback;
    this.timePassed = 0;
  }
  tick(delta) {
    this.timePassed += delta;
    const { callback, cooldown, duration, timePassed } = this;
    if (timePassed <= duration + delta) {
      const progress = Math.min(timePassed / duration, 1);
      callback(progress, this);
    }
    if (timePassed > duration + cooldown) {
      this.timePassed = 0;
    }
  }
}

class HexagonLevel1 {
  constructor() {
    const renderConfig = new HexagonRenderConfig();
    this.state = new HexagonState(renderConfig);
    this.slotColor1 = [0.9, 0.9, 0.9];
    this.slotColor2 = [1, 1, 1];

    this.obstacleGens = [GenerateSpirals, GenerateReverseSpirals, GenerateCheckerBoard];
    const fullRotationTime = 3000;
    const colorInterpolationDuration = 1000;
    const timeBetweenObstacles = 0;
    const { state } = this;
    this.tweens = [
      // interpolate slot colors
      new HexagonTween(colorInterpolationDuration, 0, (progress) => {
        const p = progress;
        const q = 1 - p;
        for (let i = 0; i < this.slotColor1.length; i++) {
          state.renderConfig.slotColors[0][i] = p * this.slotColor1[i] + q * this.slotColor2[i];
          state.renderConfig.slotColors[1][i] = q * this.slotColor1[i] + p * this.slotColor2[i];
        }
        if (progress == 1) {
          const swap = this.slotColor1;
          this.slotColor1 = this.slotColor2;
          this.slotColor2 = swap;
        }
      }),
      // generate obstacles
      new HexagonTween(1 /* end asap */, timeBetweenObstacles, (progress, tween) => {
        if (progress == 1 && state.running) {
          let duration = -1;
          const opts = {};
          do {
            const genIdx = Math.floor(Math.random() * this.obstacleGens.length);
            const gen = this.obstacleGens[genIdx];
            duration = gen(state, opts);
          } while(duration < 0);
          tween.duration = duration;
        }
      }),
      // interpolate rotation
      new HexagonTween(fullRotationTime, 0, (progress) => {
        state.renderConfig.rotation = progress;
      })
    ];
    this.reset();
  }
  reset() {
    this.timeSinceRotationStart = 0;

    const cursorColor1 = [0.5, 0.5, 0.5];
    const cursorColor2 = [0.5, 0.5, 0.5];
    const obstacleColor = [0.5, 0.5, 0.5];
    const slotColors = [this.slotColor1.slice(0), this.slotColor2.slice(0)];
    this.state.renderConfig.cursorColor1 = cursorColor1;
    this.state.renderConfig.cursorColor2 = cursorColor2;
    this.state.renderConfig.obstacleColor = obstacleColor;
    this.state.renderConfig.slotColors = slotColors;
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

// Wire up the model, graphics, input (, sound?)
class HexagonGame {
  constructor(canvas) {
    this.level = new HexagonLevel1();
    this.state = this.level.getState();
    this.renderer = new HexagonRenderer(canvas, this.state);
    this.controls = new HexagonControls(this, this.state, canvas);
    this.timeSinceLastObstacle = 0;
    this.frameTime = 0;
    this.playTime = 0;

    this.prevTime = performance.now();
    this.boundTickCb = (...args) => this.tick(...args);
    window.requestAnimationFrame(this.boundTickCb);
  }
  restart() {
    this.playTime = 0;
    this.timeSinceLastObstacle = 0;
    for (let s = 0; s < this.state.slots.length; s++) {
      const slot = this.state.slots[s];
      slot.obstacles.length = 0;
    }
    this.level.reset();
    this.state.running = true;
  }
  tick(time) {
    const { state } = this;
    const delta = time - this.prevTime;
    this.prevTime = time;
    // calculate low-pass-filtered frameTime
    const FILTER_STRENGTH = 20;
    this.frameTime += (delta - this.frameTime) / FILTER_STRENGTH;
    // move user according to last frame's state
    this.controls.tick(delta);
    // apply potential rendering and game behavior changes
    this.level.tick(delta);
    // update obstacles
    if (state.running) {
      const effect = delta / HexagonConstants.targetTickTime;
      for (let s = 0; s < state.slots.length; s++) {
        const slot = state.slots[s];
        for (let o = 0; o < slot.obstacles.length; o++) {
          const obstacle = slot.obstacles[o];
          obstacle.distance -= state.obstacleSpeed * effect;
          // dispose of dead obstacles
          if (obstacle.distance + obstacle.height < 0) {
            slot.obstacles.splice(o, 1);
            o--;
          }
        }
      }
    }
    // render new frame
    this.renderer.render(delta);
    if (state.running) {
      // check if we're dead
      if (!HexagonConstants.godMode) {
        const currentSlot = state.slots[state.getCurrentSlotIdx()];
        const { cursorY } = HexagonConstants;
        for (let o = 0; o < currentSlot.obstacles.length; o++) {
          const obstacle = currentSlot.obstacles[o];
          if (obstacle.distance <= cursorY && obstacle.distance + obstacle.height > cursorY) {
            state.running = false;
          }
        }
      }
      this.playTime += delta;
    }
    window.requestAnimationFrame(this.boundTickCb);
  }

  getPlayTime() {
    return this.playTime;
  }
  getFPS() {
    if (this.frameTime === 0) {
      return '?';
    }
    return Math.round(1000 / this.frameTime);
  }
}

const canvas = document.getElementById('hexagon-viewport');
const game = new HexagonGame(canvas);
const fpsUpdater = window.setInterval(() => {
  document.title = `Hexagon (${game.getFPS()} fps)`;
}, 2000);
const timeDisplay = document.getElementById('hexagon-time');
const secondsDisplay = timeDisplay.querySelector('.hexagon-time-seconds');
const millisDisplay = timeDisplay.querySelector('.hexagon-time-millis');
const timeUpdater = window.setInterval(() => {
  const time = game.getPlayTime();
  secondsDisplay.textContent = Math.floor(time / 1000);
  millisDisplay.textContent = ('' + Math.floor((time - Math.floor(time / 1000) * 1000) / 10)).padStart(2, '0');
}, 10);
