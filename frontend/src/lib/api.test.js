import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api.js";
import { getToken, onSessionChange, setToken } from "./session.js";

const reply = (status, body, { json = true } = {}) =>
  Promise.resolve(
    new Response(json ? JSON.stringify(body) : body, {
      status,
      headers: { "Content-Type": json ? "application/json" : "text/plain" },
    }),
  );

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  setToken(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setToken(null);
});

const fail = async (p) => p.then(() => null, (e) => e);

describe("api", () => {
  it("parses the success envelope and sends the bearer token", async () => {
    setToken("tok");
    fetchMock.mockReturnValue(reply(200, { success: true, message: "ok", data: [1], meta: { total: 1 } }));
    const out = await api("/requests", { query: { page: 2, status: "", q: undefined, x: null } });
    expect(out).toEqual({ data: [1], meta: { total: 1 }, message: "ok" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/requests?page=2");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("stringifies JSON bodies with a content type", async () => {
    fetchMock.mockReturnValue(reply(201, { data: {} }));
    await api("/auth/login", { method: "POST", body: { a: 1 }, auth: false });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe('{"a":1}');
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("omits Content-Type for formData", async () => {
    fetchMock.mockReturnValue(reply(200, { data: {} }));
    const fd = new FormData();
    await api("/users/me/avatar", { method: "PUT", formData: fd });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(fd);
    expect(init.headers["Content-Type"]).toBeUndefined();
  });

  it("passes errors[], code and data through", async () => {
    fetchMock.mockReturnValue(
      reply(409, { message: "Nope", errors: ["a", "b"], code: "LAST_ADMIN", data: { isDeactivated: true } }),
    );
    const err = await fail(api("/x", { auth: false }));
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, message: "Nope", errors: ["a", "b"], code: "LAST_ADMIN", data: { isDeactivated: true } });
  });

  it("defaults errors to []", async () => {
    fetchMock.mockReturnValue(reply(404, { message: "Route not found" }));
    const err = await fail(api("/x"));
    expect(err.errors).toEqual([]);
  });

  it("expires the session on a 401 with a token", async () => {
    setToken("tok");
    const cb = vi.fn();
    const off = onSessionChange(cb);
    fetchMock.mockReturnValue(reply(401, { message: "Token expired" }));
    const err = await fail(api("/users/me"));
    off();
    expect(err.status).toBe(401);
    expect(cb).toHaveBeenCalledWith("expired");
    expect(getToken()).toBeNull();
  });

  it("keeps the session on a 401 when the caller passes authFailure: throw", async () => {
    setToken("tok");
    const cb = vi.fn();
    const off = onSessionChange(cb);
    fetchMock.mockReturnValue(reply(401, { message: "Current password is incorrect" }));
    const err = await fail(api("/users/me/password", { method: "PATCH", body: {}, authFailure: "throw" }));
    off();
    expect(err.status).toBe(401);
    expect(err.message).toBe("Current password is incorrect");
    expect(cb).not.toHaveBeenCalled();
    expect(getToken()).toBe("tok");
  });

  it("does not expire the session on a 401 with auth: false", async () => {
    setToken("tok");
    fetchMock.mockReturnValue(reply(401, { message: "Invalid credentials" }));
    const err = await fail(api("/auth/login", { method: "POST", body: {}, auth: false }));
    expect(err.message).toBe("Invalid credentials");
    expect(getToken()).toBe("tok");
  });

  it("handles a non-JSON 429 body", async () => {
    fetchMock.mockReturnValue(reply(429, "Too many requests, please try again later.", { json: false }));
    const err = await fail(api("/x"));
    expect(err).toMatchObject({ status: 429, message: "Too many attempts. Try again in a few minutes.", errors: [] });
  });

  it("keeps the server message on 503, else uses the default", async () => {
    fetchMock.mockReturnValueOnce(reply(503, { message: "Image storage is unavailable." }));
    expect((await fail(api("/x"))).message).toBe("Image storage is unavailable.");
    fetchMock.mockReturnValueOnce(reply(503, "", { json: false }));
    expect((await fail(api("/x"))).message).toBe("This service is unavailable right now. Try again later.");
  });

  it("maps a network failure to status 0", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await fail(api("/x"));
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, message: "Can't reach Fixly. Check your connection." });
  });

  it("rethrows AbortError unchanged", async () => {
    const abort = new DOMException("aborted", "AbortError");
    fetchMock.mockRejectedValue(abort);
    expect(await fail(api("/x"))).toBe(abort);
  });
});
