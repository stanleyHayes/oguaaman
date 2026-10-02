import { ApiError } from "./api";

/** The `field` an API validation error names (spec: `invalid_setting`, `invalid_election`…). */
export function errorField(err: unknown): string | undefined {
  if (!(err instanceof ApiError)) return undefined;
  const data = err.data as { field?: unknown } | undefined;
  return typeof data?.field === "string" ? data.field : undefined;
}

/** The machine-readable `error` code, when the API sent one. */
export function errorCode(err: unknown): string | undefined {
  return err instanceof ApiError ? err.code : undefined;
}

/** A number the API attached to an error body (e.g. `maxAvailable`). */
export function errorNumber(err: unknown, key: string): number | undefined {
  if (!(err instanceof ApiError)) return undefined;
  const v = (err.data as Record<string, unknown> | undefined)?.[key];
  return typeof v === "number" ? v : undefined;
}

/**
 * Plain, specific copy for an API failure. `known` maps error codes to the
 * sentence this screen wants; anything else falls back to the server's
 * message, then to `fallback`.
 */
export function describeError(err: unknown, known: Readonly<Record<string, string>> = {}, fallback = "That didn't work. Try again."): string {
  const code = errorCode(err);
  if (code && known[code]) return known[code];
  if (err instanceof ApiError && err.status === 403) return "Your role can't do this. Ask a steward if you need it.";
  if (err instanceof ApiError && err.status === 429) return "Too many requests. Wait a minute and try again.";
  if (err instanceof Error && err.message && !/^(GET|POST|PUT|DELETE) /.test(err.message)) return err.message;
  return fallback;
}

/** Shared copy for the settings documents (news desk, ads). */
export const SETTINGS_ERRORS: Readonly<Record<string, string>> = {
  settings_conflict: "Someone else saved these settings while you were editing. Reload to see their version, then make your change again.",
  invalid_setting: "One of the values is out of range. Check the highlighted field.",
};
