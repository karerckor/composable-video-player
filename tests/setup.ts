// jsdom does not implement media playback; stub it so tests stay quiet.
// Per-test FakeMedia overrides on element instances still win over these prototype stubs.
HTMLMediaElement.prototype.pause = function () {};
HTMLMediaElement.prototype.load = function () {};
HTMLMediaElement.prototype.play = function () {
  return Promise.resolve();
};
