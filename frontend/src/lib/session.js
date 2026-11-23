const KEY = "fixly.token";
let token = null;
let hydrated = false;
const listeners = new Set();

const readStored = () => {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};

const writeStored = (value) => {
  try {
    if (value) window.sessionStorage.setItem(KEY, value);
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: memory only.
  }
};

export const getToken = () => {
  if (!hydrated) {
    hydrated = true;
    token = readStored();
  }
  return token;
};

export const setToken = (t) => {
  hydrated = true;
  token = t || null;
  writeStored(token);
};

const end = (reason) => {
  setToken(null);
  listeners.forEach((cb) => cb(reason));
};

// "signed-out" lands on /; "ended" is for flows that navigate somewhere themselves (e.g. /login with a notice).
export const clearSession = (reason = "signed-out") => end(reason);
export const expireSession = () => end("expired");

export const onSessionChange = (cb) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
