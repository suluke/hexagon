/// Interface of HexagonScreens
class HexagonScreen extends HexagonMessageReceiver {
  constructor(app) {
    super();
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
