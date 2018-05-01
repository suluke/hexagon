const HexagonConstants = {
  cursorY: 0.05,
  cursorW: 0.1,
  cursorH: 0.015,
  obstacleSpeed: 0.005,
  timeBetweenObstacles: 3000,
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
    this.cursorColor1 = [1, 0, 0];
    this.cursorColor2 = [0.5, 0, 0];
    this.obstacleColor = [0.5, 0.5, 0.5];
    this.slotColors = [[0, 0, 0], [1, 1, 1]];
  }
}

class HexagonState {
  constructor() {
    this.position = 1/12;
    this.slots = new Array(6).fill(1).map(i => new HexagonSlot());
    this.renderConfig = new HexagonRenderConfig();
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
  constructor(gl, gamestate) {
    this.gl = gl;
    this.gamestate = gamestate;
    this.config = gamestate.renderConfig;

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

    gl.useProgram(this.program);
  }

  render() {
    const { config, gamestate, gl, program } = this;
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const vertexLoc = gl.getAttribLocation(program, 'vertex');
    const aspectLoc = gl.getUniformLocation(program, 'aspect');
    gl.uniform1f(aspectLoc, gl.canvas.width / gl.canvas.height);
    const colorLoc = gl.getUniformLocation(program, 'color');
    
    // render slots
    this.updateVertexBuffer();
    // gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer); // not needed
    gl.vertexAttribPointer(vertexLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vertexLoc);

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

      float PI = 3.14159265359;

      void main() {
        float r = 1. / cos(PI / 3.);
        float alpha = (vertex.x - 1. / 12.) * 2. * PI;
        vec4 pos;
        pos.x = sin(alpha) * r;
        pos.y = cos(alpha) * r * aspect;
        pos = pos * vertex.y;
        pos.z = vertex.z;
        pos.a = vertex.a;
        //vec4 rotO = vec4(1. / 12., -r, 0., 0.);
        //pos = pos - rotO;
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
  constructor(gamestate, canvas) {
    canvas.tabIndex = 1000;
    canvas.focus();
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
    const effect = delta / HexagonConstants.targetTickTime;
    const left = keysDown.has('ArrowLeft') || this.touchLeft;
    const right = keysDown.has('ArrowRight') || this.touchRight;
    const distPerFrame = 0.03;
    if ((left || right) && !(left && right)) {
      const move = distPerFrame * effect;
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

function GenerateSpirals(state) {

}
function GenerateCheckerBoard(state) {
  const lineDist = 0.5;
  const obstHeight = 0.05;
  let y = 1.0;
  for (let line = 0; line < 5; line++) {
    for (let s = 0; s < state.slots.length; s++) {
      if ((s % 2) ^ (line % 2) === 0) {
        state.slots[s].obstacles.push(new HexagonObstacle(y, obstHeight));
      }
    }
    y += lineDist;
  }
}

// Wire up the model, graphics, input (, sound?)
class HexagonGame {
  constructor(canvas) {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const ctx = canvas.getContext('webgl', { alpha: false, antialias: true, depth: false });
    if (!ctx) {
      throw new Error('WebGL not working');
    }
    this.state = new HexagonState();
    this.renderer = new HexagonRenderer(ctx, this.state);
    this.controls = new HexagonControls(this.state, canvas);
    this.obstacleGens = [GenerateSpirals, GenerateCheckerBoard];
    this.timeSinceLastObstacle = 0;
    this.frameTime = 0;

    this.prevTime = performance.now();
    this.boundTickCb = (...args) => this.tick(...args);
    window.requestAnimationFrame(this.boundTickCb);

    // this.state.slots[0].obstacles.push(new HexagonObstacle(1.0, 0.01));
  }
  tick(time) {
    const { state, obstacleGens } = this;
    const delta = time - this.prevTime;
    this.prevTime = time;
    const effect = delta / HexagonConstants.targetTickTime;
    // calculate low-pass-filtered frameTime
    const FILTER_STRENGTH = 20;
    this.frameTime += (delta - this.frameTime) / FILTER_STRENGTH;
    // update obstacles
    for (let s = 0; s < state.slots.length; s++) {
      const slot = state.slots[s];
      for (let o = 0; o < slot.obstacles.length; o++) {
        const obstacle = slot.obstacles[o];
        obstacle.distance -= HexagonConstants.obstacleSpeed * effect;
        // dispose of dead obstacles
        if (obstacle.distance + obstacle.height < 0) {
          slot.obstacles.splice(o, 1);
          o--;
        }
      }
    }
    // create new obstacles if necessary
    if (this.timeSinceLastObstacle >= HexagonConstants.timeBetweenObstacles) {
      obstacleGens[Math.floor(Math.random() * obstacleGens.length)](state);
      this.timeSinceLastObstacle = 0;
    } else {
      this.timeSinceLastObstacle += delta;
    }
    // check if we're dead
    if (!HexagonConstants.godMode) {
      const currentSlot = state.slots[state.getCurrentSlotIdx()];
      const { cursorY } = HexagonConstants;
      for (let o = 0; o < currentSlot.obstacles.length; o++) {
        const obstacle = currentSlot.obstacles[o];
        if (obstacle.distance <= cursorY && obstacle.distance + obstacle.height > cursorY) {
          alert('Dead');
          return;
        }
      }
    }
    
    this.renderer.render(delta);
    this.controls.tick(delta);
    window.requestAnimationFrame(this.boundTickCb);
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
