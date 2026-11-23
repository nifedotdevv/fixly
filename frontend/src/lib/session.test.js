import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSession, expireSession, getToken, onSessionChange, setToken } from "./session.js";

afterEach(() => {
  vi.restoreAllMocks();
  setToken(null);
});

describe("session", () => {
  it("mirrors the token to sessionStorage", () => {
    setToken("abc");
    expect(getToken()).toBe("abc");
    expect(sessionStorage.getItem("fixly.token")).toBe("abc");
  });

  it("notifies with the right reason and unsubscribes", () => {
    const cb = vi.fn();
    const off = onSessionChange(cb);
    setToken("abc");
    expireSession();
    expect(cb).toHaveBeenLastCalledWith("expired");
    expect(getToken()).toBeNull();
    clearSession();
    expect(cb).toHaveBeenLastCalledWith("signed-out");
    off();
    clearSession();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("falls back to memory when sessionStorage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => setToken("mem")).not.toThrow();
    expect(getToken()).toBe("mem");
    expect(() => clearSession()).not.toThrow();
    expect(getToken()).toBeNull();
  });
});
