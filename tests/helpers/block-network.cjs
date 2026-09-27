"use strict";

const deny = () => {
  throw new Error("Network access blocked: flare-budget must run fully offline.");
};

try {
  const http = require("node:http");
  http.request = function blockedHttpRequest() {
    deny();
  };
  http.get = function blockedHttpGet() {
    deny();
  };
} catch {
  /* ignore */
}

try {
  const https = require("node:https");
  https.request = function blockedHttpsRequest() {
    deny();
  };
  https.get = function blockedHttpsGet() {
    deny();
  };
} catch {
  /* ignore */
}

if (typeof globalThis.fetch === "function") {
  globalThis.fetch = async function blockedFetch() {
    deny();
  };
}
