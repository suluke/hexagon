class HexagonPersistence {
  static STORAGE_KEY() {
    return 'io.github.suluke.LibreHexagon';
  }

  static async Create() {
    let data = null;
    const storage = window.localStorage;
    let storageData = null;
    if (storage)
      storageData = storage.getItem(HexagonPersistence.STORAGE_KEY());
    if (storageData !== null) {
      data = JSON.parse(storageData);
    } else {
      const version = await HexagonPersistence.getVersion();
      const variables = HexagonPersistence.getInitialVariables();
      const settings = HexagonPersistence.getInitialSettings();
      data = {variables, settings, version};
    }
    return new HexagonPersistence(data);
  }
  constructor({variables, settings, version}) {
    this.variables = variables;
    this.settings = settings;
    this.version = version;
  }
  serialize() {
    const { variables, settings, version } = this;
    return JSON.stringify({variables, settings, version});
  }
  persist() {
    if (this.settings.localStorage !== 0) {
      if (window.localStorage)
        window.localStorage.setItem(HexagonPersistence.STORAGE_KEY(), this.serialize());
    } else if (window.localStorage)
      window.localStorage.removeItem(HexagonPersistence.STORAGE_KEY());
  }
  setVariable(name, value) {

  }
  getVariable(name) {

  }
  /// suphex.dat
  static getInitialVariables() {
    const json = `
      {
        "VARIABLES": {
          "besttime0": "0",
          "besttime1": "0",
          "besttime2": "0",
          "besttime3": "0",
          "besttime4": "0",
          "besttime5": "0",
          "unlockedhyper0": "0",
          "unlockedhyper1": "0",
          "unlockedhyper2": "0",
          "finishedhyper0": "0",
          "finishedhyper1": "0",
          "finishedhyper2": "0",
          "tutorialflag": "0"
        }
      }
    `;
    const variables = JSON.parse(json).VARIABLES;
    // LibreHexagon specific variables
    // TODO
    return variables;
  }

  /// settings.dat
  static getInitialSettings() {
    const json = `
      {
        "SETTINGS": {
          "fullscreen": "0",
          "soundenabled": "1",
          "vsync": "0",
          "vcrash": "0",
          "arcademode": "0",
          "username": "PLAYER",
          "usejoypad": "1",
          "profile": "0",
          "left": "b4",
          "right": "b5",
          "confirm": "b0",
          "back": "b1",
          "scores": "b6",
          "up": "p0",
          "down": "p1"
        }
      }
    `;
    const settings = JSON.parse(json).SETTINGS;
    // LibreHexagon specific settings
    settings.localStorage = 0;
    return settings;
  }

  /// Helper to parse xml config files used by the original game
  static parseHexagonXML(xml) {
    const visit = function(xmlNode) {
      if (xmlNode.childNodes.length === 1 && xmlNode.firstChild.nodeName === '#text')
        return xmlNode.firstChild.data;
      else {
        const tree = {};
        for (let i = 0; i < xmlNode.childNodes.length; i++) {
          const childNode = xmlNode.childNodes[i];
          if (childNode.nodeName === '#text')
            continue;
          tree[childNode.tagName] = visit(childNode);
        }
        return tree;
      }
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");
    const data = visit(doc);
    return data;
  }

  static async getVersion() {
    const url = window.location.href;
    if (/^file:\/\//.test(url)) {
      try {
        const ref = await new Promise((res, rej) => {
          const iframe = document.createElement('iframe');
          // iframe.id = 'iframe';
          iframe.style.display = 'none';
          document.body.appendChild(iframe);
          iframe.onload = function() {
            let content = null;
            try {
              content = iframe.contentDocument.body.firstChild.innerHTML;
            } catch(e) {
              rej(e);
              return;
            }
            res(content);
          };
          iframe.onerror = function(e) { rej(e); }
          iframe.src = '.git/refs/heads/master';
        });
        return 'dev-' + ref;
      } catch(e) {
        return 'dev';
      }
    } else if (/http:\/\/hallobitte.com\//.test(url))
      return 'preview';
    else if (/https:\/\/suluke.github.io\//.test(url)) {
      const apiReq = new Request('https://api.github.com/repos/suluke/hexagon/commits/master');
      const result = await fetch(apiReq);
      const json = await result.json();
      return json.commit.tree.sha;
    } else if (window.HEXAGON_VERSION)
      return window.HEXAGON_VERSION;
    return 'unknown';
  }
}
