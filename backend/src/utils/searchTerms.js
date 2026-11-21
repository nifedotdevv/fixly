// Skills, city and areas are stored and matched as lowercase, single-spaced text.
export const normalizeTerm = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : value;
