class HexagonAbstractButton {
  constructor(elm) {
    this.elm = elm;
    this.listeners = [];
    const trigger = (evt) => {
      evt.stopPropagation();
      this.trigger();
    };
    this.elm.addEventListener('click', trigger);
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
  constructor(sound) {
    super(HexagonApp.parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="hexagon-directional-button" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="0" y="5" width="95" height="95"></rect>
        <rect x="5" y="0" width="95" height="95"></rect>
        <path d="M20,50 L35,15 L35,30 L80,30 L80,70 L35,70 L35,85z" fill="black"></path>
      </svg>
    `));
    this.sound = sound;
  }
  trigger() {
    if (this.sound)
      this.sound.play();
    super.trigger();
  }
}

class HexagonTopEdgeButton extends HexagonAbstractButton {
  constructor(textOrElm, right) {
    super(HexagonApp.parseHtml(`
      <div class="hexagon-top-edge-button"></div>
    `));
    if (typeof(textOrElm) === 'string' || textOrElm instanceof String) {
      const textNode = HexagonApp.parseHtml(`<span>${textOrElm}</span>`);
      this.elm.appendChild(textNode);
    } else
      this.elm.appendChild(textOrElm);
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
