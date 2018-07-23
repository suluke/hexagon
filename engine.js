const HexagonConstants = {
  innerHexagonY: 0.025,
  outerHexagonY: 0.03,
  cursorY: 0.035,
  cursorW: 0.05,
  cursorH: 0.008,
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

class HexagonObstaclePool {
  constructor() {
    this.obstacles = [];
  }
  acquire(distance, height) {
    if (this.obstacles.length === 0)
      return new HexagonObstacle(distance, height);
    const o = this.obstacles.pop();
    o.distance = distance;
    o.height = height;
    return o;
  }
  release(o) {
    this.obstacles.push(o);
  }
  releaseAll(os) {
    Array.prototype.push.apply(this.obstacles, os);
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
    this.cursorColor = null;
    this.cursorShadowColor = null;
    this.innerHexagonColor = null;
    this.outerHexagonColor = null;
    this.obstacleColor = null;
    this.slotColors = null;
    this.rotation = 0;
    this.zoom = 1;
    this.cameraOffset = [0, 0];
  }
}

class HexagonState {
  constructor(renderConfig) {
    this.running = true;
    this.position = 1 / 12;
    this.obstacleSpeed = 0.005;
    this.cursorSpeed = 0.03;
    this.slots = new Array(6).fill(null).map(elm => new HexagonSlot());
    this.renderConfig = renderConfig;
  }
  getSlotWidthSum() {
    return this.slots.reduce((acc, slot) => acc + slot.width, 0);
  }
  getActiveSlots() {
    return this.slots.filter((slot) => slot.width > 0);
  }
  getSlotIdxAtPosition(position) {
    const { slots } = this;
    // we are on a slot if it's a) wider than 0 and b) the slot's right
    // border is the first that is greater than position
    const slotWidthSum = this.getSlotWidthSum(); // in [0, 6], position in [0, 1)
    let s = 0; // the index of the slot we're on according to `position`
    // we are on slot s if position in [left, right).
    for (let x = slots[0].width; x <= position * slotWidthSum; s++)
      x += slots[(s + 1) % slots.length].width;
    if (s >= slots.length)
      throw new Error(`target slot out of bounds (${s}/${this.slots.length})`);
    return s;
  }
  getCurrentSlotIdx() {
    return this.getSlotIdxAtPosition(this.position);
  }
}
// end game model

/// All things graphics
class HexagonRenderer {
  constructor(game, canvas) {
    this.game = game;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true, depth: false });
    if (!gl) {
      throw new Error('WebGL not working');
    }
    this.gl = gl;
    this.program = this.createProgram();
    this.vertexBuffer = gl.createBuffer();
    this.projection = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ];
    window.addEventListener('resize', (event) => {
      const W  = gl.canvas.clientWidth;
      const H = gl.canvas.clientHeight;
      if (gl.canvas.width  !== W ||
          gl.canvas.height !== H) {
        gl.canvas.width  = W;
        gl.canvas.height = H;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      }
    });

    gl.useProgram(this.program);
  }

  render() {
    const { gl, program } = this;
    const gamestate = this.game.getState();
    const config = gamestate.renderConfig;
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const aspectLoc = gl.getUniformLocation(program, 'aspect');
    const aspect = gl.canvas.width / gl.canvas.height;
    gl.uniform1f(aspectLoc, aspect);
    const rotationLoc = gl.getUniformLocation(program, 'rotation');
    gl.uniform1f(rotationLoc, config.rotation);
    const zLoc = gl.getUniformLocation(program, 'z');
    gl.uniform1f(zLoc, 0);
    const camLoc = gl.getUniformLocation(program, 'cam');
    gl.uniform2f(camLoc, ...config.cameraOffset);
    const projLoc = gl.getUniformLocation(program, 'proj');
    const proj = this.projection;
    // The longer dimension will see the full viewport - which is a 1x1 square.
    // Since by default we project to have x coordinates go from -1 to 1,
    // we only need to zoom if y is longer - i.e. aspect is less than zero
    const aspectZoom = aspect >= 1 ? 1 : 1 / aspect;
    proj[0 * 4 + 0] = config.zoom * aspectZoom;
    proj[1 * 4 + 1] = config.zoom * aspectZoom;
    gl.uniformMatrix4fv(projLoc, false, proj);

    // render slots
    this.updateVertexBuffer();
    // gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer); // not needed
    const vertexLoc = gl.getAttribLocation(program, 'vertex');
    gl.vertexAttribPointer(vertexLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vertexLoc);

    const colorLoc = gl.getUniformLocation(program, 'color');
    // inner hex + outer hex + cursor + cursorShadow
    let offset = 8 + 8 + 3 + 3;
    for (let i = 0; i < gamestate.slots.length; i++) {
      gl.uniform3f(colorLoc, ...config.slotColors[i % config.slotColors.length]);
      gl.drawArrays(gl.TRIANGLE_STRIP, offset, 4);
      offset += 4;
    }
    // render obstacles
    const obstacleCount = gamestate.slots.reduce((acc, slot) => { return acc + slot.obstacles.length; }, 0);
    gl.uniform3f(colorLoc, ...config.obstacleColor);
    for (let i = 0; i < obstacleCount; i++) {
      gl.drawArrays(gl.TRIANGLE_STRIP, offset, 4);
      offset += 4;
    }
    offset = 0;
    // render outer hexagon
    gl.uniform3f(colorLoc, ...config.outerHexagonColor);
    gl.drawArrays(gl.TRIANGLE_FAN, offset, 8);
    offset += 8;
    // render inner hexagon
    gl.uniform3f(colorLoc, ...config.innerHexagonColor);
    gl.drawArrays(gl.TRIANGLE_FAN, offset, 8);
    offset += 8;
    // render cursor shadow
    if (config.cursorShadowColor) {
      gl.uniform1f(zLoc, -0.05);
      gl.uniform3f(colorLoc, ...config.cursorShadowColor);
      gl.drawArrays(gl.TRIANGLES, offset, 3);
      gl.uniform1f(zLoc, 0);
    }
    offset += 3;
    // render cursor
    gl.uniform3f(colorLoc, ...config.cursorColor);
    gl.drawArrays(gl.TRIANGLES, offset, 3);

    gl.flush();
  }

  updateVertexBuffer() {
    const { gl } = this;
    const gamestate = this.game.getState();
    const vertices = [];
    const { cursorH, cursorW, cursorY, innerHexagonY, outerHexagonY } = HexagonConstants;
    // create outer hexagon vertices
    vertices.push(0, 0);
    for (let i = 0; i <= gamestate.slots.length; i++) {
      vertices.push(i / 6, outerHexagonY);
    }
    // create inner hexagon vertices
    vertices.push(0, 0);
    for (let i = 0; i <= gamestate.slots.length; i++) {
      vertices.push(i / 6, innerHexagonY);
    }
    // cursor coordinates
    const cLeft = gamestate.position - cursorW / 2;
    const cRight = gamestate.position + cursorW / 2;
    const cTop = cursorY + cursorH;
    // create cursorShadow vertices
    vertices.push(cLeft, cursorY);
    vertices.push(cRight, cursorY);
    vertices.push(gamestate.position, cTop);
    // create cursor vertices
    vertices.push(cLeft, cursorY);
    vertices.push(cRight, cursorY);
    vertices.push(gamestate.position, cTop);
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
      uniform float z;
      uniform mat4 proj;

      float PI = 3.14159265359;

      void main() {
        // we want to rotate the the edge coordinates of the slots to be
        // placed equidistantly on a unit circle. Edge coordinates are in
        // the range [0, 1]. Therefore, 0 should be mapped to 0 degrees
        // rotation, 0.5 to 180 degrees etc. => the angle is x * 2 * PI
        float alpha = fract(vertex.x + rotation) * 2. * PI;

        // viewport is from -1 to 1 and an obstacle should become visible
        // as soon as its lower y coordinate is <= 1. Assuming aspect is
        // 1 for now, an obstacle coming from 45 degrees with distance
        // 1 will become visible at (1.0/1.0) => it should be sqrt(2)
        // away from the center
        float r = sqrt(2.);

        vec4 pos;
        // first, convert from "normal" xy coords to coords on circle
        pos.x = sin(alpha) * r;
        pos.y = cos(alpha) * r * aspect;
        // scale the point by distance to bottom
        pos *= vertex.y;
        pos.z = vertex.z;
        pos.w = vertex.w;
        pos = proj * pos;
        gl_Position = pos;
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
  constructor(game, canvas) {
    canvas.tabIndex = 1000;
    canvas.focus();
    this.game = game;
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
    const { keysDown } = this;
    const gamestate = this.game.getState();
    if (!gamestate.running) {
      return;
    }
    const effect = delta / HexagonConstants.targetTickTime;
    const left = keysDown.has('ArrowLeft') || this.touchLeft;
    const right = keysDown.has('ArrowRight') || this.touchRight;
    if ((left || right) && !(left && right)) {
      const move = gamestate.cursorSpeed * effect;
      const sign = left ? -1 : 1;
      let newpos = gamestate.position + move * sign;
      const wrapcorrection = newpos >= 1 ? -1 : (newpos < 0 ? 1 : 0);
      newpos += wrapcorrection;
      // Check for sideways collisions
      const { slots } = gamestate;
      const slotWidthSum = gamestate.getSlotWidthSum();
      let s = gamestate.getSlotIdxAtPosition(newpos); // the index of the slot we *should* move onto
      const targetSlot = gamestate.slots[s];
      const { cursorY, cursorH } = HexagonConstants;
      const cursorTip = cursorY + cursorH;
      for (let o = 0; o < targetSlot.obstacles.length; o++) {
        const obstacle = targetSlot.obstacles[o];
        if (obstacle.distance <= cursorTip && obstacle.distance + obstacle.height > cursorTip) {
          // collision - can't move here
          s = gamestate.getCurrentSlotIdx();
          let posInSlot = slots.filter((slot, idx) => idx < s).reduce((acc, slot) => acc + slot.width, 0.);
          if (right)
            posInSlot += slots[s].width - 0.0001;
          newpos = posInSlot / slotWidthSum;
          break;
        }
      }
      gamestate.position = newpos;
    }
  }
}

// begin obstacle generators
// Reference: http://hexagon.wikia.com/wiki/Super_Hexagon
function GenerateSpiral(state, pool, { obstacleHeight = 0.05, numLines = 10, initialY = 1.0, reverse = false } = {}) {
  const activeSlots = state.getActiveSlots();
  if (activeSlots.length % 3 !== 0 || numLines <= 0) {
    return -1;
  }
  let y = initialY;
  const r = reverse ? -1 : 1;
  for (let line = 0; line < numLines; line++) {
    for (let i = 0; i < activeSlots.length; i += 3) {
      const slot = activeSlots[(i + line * r + numLines) % activeSlots.length];
      if (line === 1)
        slot.obstacles.push(pool.acquire(y - obstacleHeight, 2 * obstacleHeight));
      else
        slot.obstacles.push(pool.acquire(y, obstacleHeight));
    }
    y += obstacleHeight;
  }
  y -= obstacleHeight;
  return y;
}
function GenerateReverseSpiral(state, pool, options) {
  options.reverse = !options.reverse;
  return GenerateSpiral(state, pool, options);
}
function GenerateRain(state, pool, { obstacleHeight = 0.05, lineDist = 0.15, numLines = 5, initialY = 1.0 } = {}) {
  let y = initialY;
  for (let line = 0; line < numLines; line++) {
    for (let s = 0; s < state.slots.length; s++) {
      if ((s % 2) ^ (line % 2) === 0) {
        state.slots[s].obstacles.push(pool.acquire(y, obstacleHeight));
      }
    }
    y += lineDist;
  }
  y -= (lineDist - obstacleHeight);
  return y;
}
function GenerateC(state, pool, { obstacleHeight = 0.03, initialY = 1.0, openSlotOffset = -1 } = {}) {
  const activeSlots = state.getActiveSlots();
  if (openSlotOffset < 0)
    openSlotOffset = Math.floor(Math.random() * activeSlots.length);
  for (let i = 0; i < activeSlots.length; i++)
    if (i != openSlotOffset)
      activeSlots[i].obstacles.push(pool.acquire(initialY, obstacleHeight));
  return initialY + obstacleHeight;
}
function GenerateLadder(state, pool, { obstacleHeight = 0.05, initialY = 1.0, numSteps = 4, stepDist = 0.09 } = {}) {
  const activeSlots = state.getActiveSlots();
  if (activeSlots.length !== 6)
    return -1;
  const height = (obstacleHeight + stepDist) * numSteps * 2 - stepDist;
  const stem1Slot = 0;
  const stem2Slot = (stem1Slot + 3) % 6;
  let y = initialY;
  state.slots[stem1Slot].obstacles.push(pool.acquire(y, height));
  state.slots[stem2Slot].obstacles.push(pool.acquire(y, height));
  for (let i = 0; i < numSteps; i++) {
    state.slots[(stem1Slot + 1) % 6].obstacles.push(pool.acquire(y, obstacleHeight));
    state.slots[(stem2Slot + 1) % 6].obstacles.push(pool.acquire(y, obstacleHeight));
    y += obstacleHeight + stepDist;
    state.slots[(stem1Slot + 2) % 6].obstacles.push(pool.acquire(y, obstacleHeight));
    state.slots[(stem2Slot + 2) % 6].obstacles.push(pool.acquire(y, obstacleHeight));
    y += obstacleHeight + stepDist;
  }
  y -= stepDist;
  return y;
}
function GenerateDoubleTurn(state, pool, opts = {}) {
  return -1;
}
function GenerateBat(state, pool, opts = {}) {
  return -1;
}
function GeneratePot(state, pool, { obstacleHeight = 0.05, initialY = 1.0, offset = 0 } = {}) {
  const activeSlots = state.getActiveSlots();
  if (activeSlots.length !== 6)
    return -1;
  for (let i = 0; i < 3; i++) {
    state.slots[(i + offset) % 6].obstacles.push(pool.acquire(initialY, obstacleHeight));
  }
  state.slots[(4 + offset) % 6].obstacles.push(pool.acquire(initialY, obstacleHeight));

  return obstacleHeight + initialY;
}
// end obstacle generators

// Manage state required to interpolate time-based progress of animations etc.
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

// Wire up the model, graphics, input (, sound?)
class HexagonGame {
  constructor(canvas, obstaclePool) {
    this.level = null;
    this.obstaclePool = obstaclePool;
    this.renderer = new HexagonRenderer(this, canvas);
    this.controls = new HexagonControls(this, canvas);
    this.timeSinceLastObstacle = 0;
    this.frameTime = 0;
    this.playTime = 0;
    const renderConfig = new HexagonRenderConfig();
    this.state = new HexagonState(renderConfig);

    this.prevTime = performance.now();
    this.boundTickCb = (time) => this.tick(time);
    window.requestAnimationFrame(this.boundTickCb);
  }
  restart() {
    const state = this.getState();
    this.playTime = 0;
    this.timeSinceLastObstacle = 0;
    for (let s = 0; s < state.slots.length; s++) {
      const slot = state.slots[s];
      this.obstaclePool.releaseAll(slot.obstacles);
      slot.obstacles.length = 0;
    }
    this.level.reset();
    state.running = true;
  }
  tick(time) {
    const state = this.getState();
    const delta = time - this.prevTime;
    this.prevTime = time;
    // calculate low-pass-filtered frameTime
    const FILTER_STRENGTH = 20;
    this.frameTime += (delta - this.frameTime) / FILTER_STRENGTH;
    // move user according to last frame's state
    this.controls.tick(delta);
    // apply potential rendering and game behavior changes
    if (this.level)
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
            this.obstaclePool.release(slot.obstacles.splice(o, 1)[0]);
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
        const { cursorY, cursorH } = HexagonConstants;
        const cursorTip = cursorY + cursorH;
        for (let o = 0; o < currentSlot.obstacles.length; o++) {
          const obstacle = currentSlot.obstacles[o];
          if (obstacle.distance <= cursorTip && obstacle.distance + obstacle.height > cursorTip)
            state.running = false;
        }
      }
      this.playTime += delta;
    }
    window.requestAnimationFrame(this.boundTickCb);
  }
  getState() {
    return this.state;
  }
  getPlayTime() {
    return this.playTime;
  }
  getFPS() {
    if (this.frameTime === 0)
      return '?';
    return Math.round(1000 / this.frameTime);
  }
  setLevel(level) {
    this.level = level;
  }
}
