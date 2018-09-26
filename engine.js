const HexagonConstants = {
  innerHexagonY: 0.025,
  outerHexagonY: 0.03,
  cursorY: 0.035,
  cursorW: 0.05,
  cursorH: 0.008,
  flashDuration: 100,
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
    this.eye = [0, 0];
    this.lookAt = [0, 0];
    this.flashTime = 0;
  }
}

class HexagonState {
  constructor(renderConfig) {
    this.running = false;
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
    // Caches the parameters that influence the view-projection matrix
    // and only recomputes the matrix if necessary. Furthermore, memory
    // allocated for the intermediate matrices is maintained here so that
    // no new allocations are necessary.
    class ProjectionConfig {
      constructor() {
        this.eye = [0, 0];
        this.lookAt = [0, 0];
        this.aspect = 1;
        this.fov = 45;
        this.far = 10;
        this.near = 0.1;
        this.view = Matrix.lookAt(...this.eye, 1, ...this.lookAt, 0, 0, 1, 0);
        this.proj = Matrix.perspective(this.fov, this.aspect, this.near, this.far);
        this.temp = new Matrix();
        this.viewproj = new Matrix();
      }
      getUpdatedViewProjection(aspect, renderconfig) {
        const { eye, lookAt } = renderconfig;
        let changed = false;
        // Check if the view matrix needs updating
        if (eye[0] !== this.eye[0] || eye[1] !== this.eye[1] ||
            lookAt[0] !== this.lookAt[0] || lookAt[1] !== this.lookAt[1]) {
          changed = true;
          this.eye[0] = eye[0];
          this.eye[1] = eye[1];
          this.lookAt[0] = lookAt[0];
          this.lookAt[1] = lookAt[1];
          this.view = Matrix.lookAt(...this.eye, 1, ...this.lookAt, 0, 0, 1, 0, this.view);
        }
        // Check if the projection matrix needs updating
        if (aspect !== this.aspect) {
          changed = true;
          this.aspect = aspect;
          this.proj = Matrix.perspective(this.fov, this.aspect, this.near, this.far, this.proj);
        }
        // Any changes require a recomputation of the view-projection
        if (changed) {
          this.temp = this.proj.multiply(this.view, this.temp);
          this.viewproj = this.temp.transpose(this.viewproj);
        }
        return this.viewproj;
      }
    };
    this.projection = new ProjectionConfig();

    gl.useProgram(this.program);
  }

  getProjectionMatrix() {
    const aspect = this.gl.canvas.width / this.gl.canvas.height;
    const gamestate = this.game.getState();
    const config = gamestate.renderConfig;
    return this.projection.getUpdatedViewProjection(aspect, config).m;
  }

  render(delta) {
    const { gl, program } = this;
    const gamestate = this.game.getState();
    const config = gamestate.renderConfig;
    if (config.flashTime > 0) {
      gl.clearColor(1.0, 1.0, 1.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      config.flashTime = Math.max(0, config.flashTime - delta);
      return;
    }
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const rotationLoc = gl.getUniformLocation(program, 'rotation');
    gl.uniform1f(rotationLoc, config.rotation);
    // The longer dimension will see the full viewport - which is a 1x1 square.
    // Since by default we project to have x coordinates go from -1 to 1,
    // we only need to zoom if y is longer - i.e. aspect is less than zero
    const aspect = gl.canvas.width / gl.canvas.height;
    const aspectZoom = aspect >= 1 ? aspect : 1;
    const zoom = config.zoom * aspectZoom;
    const zoomLoc = gl.getUniformLocation(program, 'zoom');
    gl.uniform1f(zoomLoc, zoom);
    const zLoc = gl.getUniformLocation(program, 'z');
    gl.uniform1f(zLoc, 0);
    const projLoc = gl.getUniformLocation(program, 'proj');
    const proj = this.getProjectionMatrix();
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
      gl.uniform1f(zLoc, -0.01);
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
    const sl = 2;
    for (let i = 0; i < gamestate.slots.length; i++) {
      vertices.push(x, 0);
      vertices.push(x, sl);
      x += gamestate.slots[i].width / slotWidthSum;
      vertices.push(x, 0);
      vertices.push(x, sl);
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
      uniform float rotation;
      uniform float z;
      uniform float zoom;
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
        pos.y = cos(alpha) * r;
        // scale the point by distance to bottom
        pos *= vertex.y;
        // apply zoom
        pos.xy *= zoom;
        // prepare for projection
        pos.z = z;
        pos.w = 1.;
        pos = proj * pos;
        //pos.xyz /= pos.w;
        pos.z = 0.;
        //pos.w = 1.;
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
/// Since we want all keyboard events to go through this class, this is
/// also where everyone else that wants key press information should
/// go through. See `addKeyListener`.
class HexagonControls {
  constructor(game, canvas, topLevelElm) {
    this.game = game;
    this.newKeysDown = new Set();
    //~ this.keyDownTimes = {};
    //~ this.keyRepeatMillis = 150;
    this.keysDown = new Set();
    this.keyListeners = [];
    this.touchLeft = false;
    this.touchRight = false;

    canvas.tabIndex = 0;
    canvas.focus();
    canvas.addEventListener('keydown', (event) => {
      this.keysDown.add(event.code);
      this.newKeysDown.add(event.code);
      //~ this.keyDownTimes[event.code] = 0;
    });
    canvas.addEventListener('keyup', (event) => {
      this.keysDown.delete(event.code);
    });
    canvas.addEventListener('blur', (event) => {
      canvas.focus();
    });
    canvas.addEventListener('focusout', (event) => {
      canvas.focus();
    });

    let isDown = false;
    const touchDown = (event) => {
      canvas.focus();
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
    // Other elements in the container may be clicked, but they should not
    // assume the focus
    topLevelElm.tabIndex = 0;
    topLevelElm.addEventListener('focusin', (event) => {
      canvas.focus();
    });
  }
  addKeyListener(listener) {
    this.keyListeners.push(listener);
  }
  tick(delta) {
    const { newKeysDown, keysDown, /* keyDownTimes, keyRepeatMillis,*/ keyListeners } = this;
    // Update keyDownTimes
    //~ for (let key of keysDown) {
      //~ keyDownTimes[key] += delta;
      //~ if (keyDownTimes[key] > keyRepeatMillis) {
        //~ keyDownTimes[key] = 0;
        //~ newKeysDown.add(key);
      //~ }
    //~ }
    // Forward key information to key event listeners
    if (newKeysDown.size > 0) {
      for (let i = 0; i < keyListeners.length; i++)
        keyListeners[i](newKeysDown);
      newKeysDown.clear();
    }
    // Apply controls on game state
    // TODO this feels like bad separation of concerns
    const gamestate = this.game.getState();
    if (!gamestate.running)
      return;
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

class HexagonSound {
  constructor(container, messageBus) {
    this.container = container;
    this.sounds = [];
    this.canPlay = true;
    this.testSound = this.addSound('data/sounds/silence.mp3');
    this.testSound.play().catch(() => {
      this.canPlay = false;
      // HACK browsers won't let us play sounds without user interaction.
      // We therefore add an additional overlay the user needs to click
      // through which at the same time enables us to play sounds again.
      messageBus.sendMessage('app', new HexagonMessage('forceUserInteraction', null));
    });
  }
  /// @return a sound that only contains silence
  getTestSound() {
    return this.testSound;
  }
  addSound(src) {
    class Sound {
      constructor(soundMgr, src, parentElm) {
        this.elm = document.createElement('audio');
        this.elm.src = src;
        this.elm.setAttribute('preload', 'auto');
        this.elm.setAttribute('controls', 'none');
        this.elm.autoplay = false;
        this.elm.style.display = 'none';
        this.soundMgr = soundMgr;
        parentElm.appendChild(this.elm);
      }
      async play() {
        if (!this.soundMgr.canPlay)
          return;
        return this.elm.play();
      }
      pause() {
        this.elm.pause();
      }
      stop() {
        this.elm.pause();
        this.elm.currentTime = 0;
      }
      setLooping(loop) {
        this.elm.loop = loop;
      }
    }
    const sound = new Sound(this, src, this.container);
    this.sounds.push(sound);
    return sound;
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
function GenerateRain(state, pool, { obstacleHeight = 0.03, lineDist = 0.15, numLines = 5, initialY = 1.0 } = {}) {
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
function GenerateDoubleTurn(state, pool, { startSlot = 0, initialY = 1.0, obstacleHeight = 0.03, corridorWidth = 0.18, reverse = false }) {
  const activeSlots = state.getActiveSlots();
  if (activeSlots.length !== 6)
    return -1;
  const height = 3 * obstacleHeight + 2 * corridorWidth;
  activeSlots[startSlot].obstacles.push(pool.acquire(initialY, height));
  let y = initialY;
  let sign = reverse ? -1 : 1;
  for (let i = 0; i < 3; i++) {
    for (let s = 1; s < 5; s++) {
      const slot = activeSlots[(startSlot + s * sign + 6) % 6];
      slot.obstacles.push(pool.acquire(y, obstacleHeight));
    }
    sign = 0 - sign;
    y += obstacleHeight + corridorWidth;
  }
  return height + initialY;
}
function GenerateReverseDoubleTurn(state, pool, options) {
  options.reverse = !options.reverse;
  return GenerateDoubleTurn(state, pool, options);
}
function GenerateBat(state, pool, { startSlot = 0, initialY = 1.0 }) {
  // TODO parameter support
  const activeSlots = state.getActiveSlots();
  if (activeSlots.length !== 6)
    return -1;
  const ss = startSlot + 6;
  let y = initialY;
  activeSlots[(ss + 1) % 6].obstacles.push(pool.acquire(y, 0.05));
  activeSlots[(ss - 1) % 6].obstacles.push(pool.acquire(y, 0.05));
  y += 0.02;
  activeSlots[(ss + 2) % 6].obstacles.push(pool.acquire(y, 0.03));
  activeSlots[(ss - 2) % 6].obstacles.push(pool.acquire(y, 0.03));
  y += 0.1;
  activeSlots[(ss + 3) % 6].obstacles.push(pool.acquire(y, 0.09));
  y += 0.04;
  activeSlots[(ss + 2) % 6].obstacles.push(pool.acquire(y, 0.03));
  activeSlots[(ss - 2) % 6].obstacles.push(pool.acquire(y, 0.03));
  y += 0.1;
  activeSlots[(ss + 1) % 6].obstacles.push(pool.acquire(y, 0.05));
  activeSlots[(ss - 1) % 6].obstacles.push(pool.acquire(y, 0.05));
  y += 0.05;
  activeSlots[startSlot].obstacles.push(pool.acquire(initialY, y - initialY));
  return y;
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
  constructor(duration, cooldown, state, callback) {
    this.duration = duration;
    this.cooldown = cooldown;
    this.state = state;
    this.callback = callback;
    this.timePassed = 0;
  }
  tick(delta) {
    this.timePassed += delta;
    const { callback, duration, timePassed } = this;
    if (timePassed <= duration + delta) {
      const progress = Math.min(timePassed / duration, 1);
      callback(progress, this.state, this);
    }
    const { cooldown } = this;
    if (timePassed > duration + cooldown)
      this.timePassed = 0;
  }
}

/// Interface of HexagonLevels
class HexagonLevel {
  tick(delta) {
    throw new Error('Needs to be overwritten by derived implementation');
  }
  onStop() {
    throw new Error('Needs to be overwritten by derived implementation');
  }
}

/// Message struct that can be deliverd over the MessageBus
class HexagonMessage {
  constructor(name, payload) {
    this.name = name;
    this.payload = payload;
  }
  getName() {
    return this.name;
  }
  getPayload() {
    return this.payload;
  }
}

/// Interface for classes that can consume messages
class HexagonMessageReceiver {
  receiveMessage(msg) {
    throw new Error('Needs to be overwritten by derived implementation');
  }
}

/// A dictionary-based message delivery bus.
/// Messages are 'actions' that 
class HexagonMessageBus {
  constructor() {
    this.recipients = {};
  }
  registerRecipient(name, recipient) {
    this.recipients[name] = recipient;
  }
  sendMessage(recipientName, action) {
    const recipient = this.recipients[recipientName];
    if (!recipient) {
      console.warn(`No action recipient found for name "${recipientName}"`);
      return;
    }
    recipient.receiveMessage(action);
  }
}


// Wire up the model, graphics, input, sound
class HexagonGame extends HexagonMessageReceiver {
  constructor(container, canvas, audioContainer, messageBus, obstaclePool) {
    super();
    this.level = null;
    this.obstaclePool = obstaclePool;
    const renderConfig = new HexagonRenderConfig();
    this.state = new HexagonState(renderConfig);
    this.renderer = new HexagonRenderer(this, canvas);
    messageBus.registerRecipient('engine', this);
    this.sound = new HexagonSound(audioContainer, messageBus);
    this.controls = new HexagonControls(this, canvas, container);
    this.timeSinceLastObstacle = 0;
    this.frameTime = 0;
    this.playTime = 0;

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
    if (this.level)
      this.level.reset();
    state.running = true;
  }
  update(distance) {
    const state = this.getState();
    const currentSlotIdx = state.getCurrentSlotIdx();
    const { cursorY, cursorH } = HexagonConstants;
    const cursorTip = cursorY + cursorH;
    let revertBy = 0;
    for (let s = 0; s < state.slots.length; s++) {
      const slot = state.slots[s];
      for (let o = 0; o < slot.obstacles.length; o++) {
        const obstacle = slot.obstacles[o];
        obstacle.distance -= distance;
        const playerHit = s === currentSlotIdx
                          && obstacle.distance <= cursorTip
                          && obstacle.distance + distance > cursorTip;
        if (!HexagonConstants.godMode && playerHit)
          revertBy = cursorTip - obstacle.distance;
        else if (obstacle.distance + obstacle.height < 0) {
          // dispose of dead obstacles
          this.obstaclePool.release(slot.obstacles.splice(o, 1)[0]);
          o--;
        }
      }
    }
    if (revertBy !== 0) {
      state.running = false;
      for (let s = 0; s < state.slots.length; s++) {
        const slot = state.slots[s];
        for (let o = 0; o < slot.obstacles.length; o++) {
          const obstacle = slot.obstacles[o];
          obstacle.distance += revertBy;
        }
      }
      return false;
    }
    return true;
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
    // update game
    if (state.running) {
      const effect = delta / HexagonConstants.targetTickTime;
      const distance = state.obstacleSpeed * effect;
      if (this.update(distance))
        this.playTime += delta;
      else {
        state.renderConfig.flashTime = HexagonConstants.flashDuration;
        this.level.onStop();
      }
    }
    // render new frame
    this.renderer.render(delta);
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
  getSoundManager() {
    return this.sound;
  }
  addKeyListener(listener) {
    this.controls.addKeyListener(listener);
  }
  receiveMessage(msg) {
    switch(msg.getName()) {
      case 'userInteractionForced': {
        this.sound.canPlay = true;
        break;
      }
      default:
        console.warn(`No handler defined for message of type "${msg.getName()}"`);
    }
  }
}
