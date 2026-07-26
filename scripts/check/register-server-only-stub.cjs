const Module = require("node:module");

const load = Module._load;
Module._load = function loadWithServerOnlyStub(request, parent, isMain) {
  if (request === "server-only" || request.endsWith("/server-only/index.js")) return {};
  return load.call(this, request, parent, isMain);
};
