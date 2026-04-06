/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unused-vars */
var registry = new Map();
var nextRef = 1;

function register(el) {
  for (var entry of registry) {
    if (entry[1] === el) return entry[0];
  }

  var ref = nextRef++;
  registry.set(ref, el);
  return ref;
}

function getEl(ref) {
  var el = registry.get(ref);
  if (!el || !el.isConnected) {
    registry.delete(ref);
    return null;
  }
  return el;
}

function clearRegistry() {
  registry.clear();
  nextRef = 1;
}
