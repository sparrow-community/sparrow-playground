/**
 * Instance variables from getInstance are map[name] → JSON text (kernel
 * projection stores json_value strings). Decode before editing / display so
 * bools and numbers are real JSON types, not quoted strings.
 *
 * Do not run this on values already parsed from a JSON editor (parseVarsJson):
 * quoted strings like `"false"` must stay strings.
 */

/**
 * Decode getInstance / job variable maps (json_value strings → typed values).
 * Non-string values pass through; invalid JSON text stays as the raw string.
 * @param {Record<string, unknown> | null | undefined} raw
 * @returns {Record<string, unknown>}
 */
export function decodeInstanceVariables(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "string") {
      out[k] = v;
      continue;
    }
    try {
      out[k] = JSON.parse(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}
