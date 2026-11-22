import { expireSession, getToken } from "./session.js";

const BASE = "/api/v1";

export class ApiError extends Error {
  constructor({ status, message, errors = [], code, data }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
    this.code = code;
    this.data = data;
  }
}

const buildQuery = (query) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    params.append(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
};

const parseBody = async (res) => {
  try {
    const parsed = await res.json();
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export async function api(path, { method = "GET", body, formData, auth = true, query, signal } = {}) {
  const headers = { Accept: "application/json" };
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${BASE}${path}${buildQuery(query)}`, { method, headers, body: payload, signal });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ApiError({ status: 0, message: "Can't reach Fixly. Check your connection." });
  }

  const json = await parseBody(res);

  if (res.ok) {
    return { data: json.data, meta: json.meta, message: json.message };
  }

  if (res.status === 401 && token) expireSession();

  let message = json.message;
  if (res.status === 429) message = "Too many attempts. Try again in a few minutes.";
  else if (res.status === 503 && !message) message = "This service is unavailable right now. Try again later.";
  if (!message) message = "Something went wrong. Try again.";

  throw new ApiError({
    status: res.status,
    message,
    errors: Array.isArray(json.errors) ? json.errors : [],
    code: json.code,
    data: json.data,
  });
}
