const level = (process.env.LOG_LEVEL ?? "info").toLowerCase();
export const isDebug = level === "debug";

export function dbg(...args: unknown[]) {
  if (isDebug) console.log("[debug]", ...args);
}
