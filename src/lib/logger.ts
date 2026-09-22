/**
 * Minimal structured console logger — writes to stdout/stderr so it shows
 * up in `docker logs` / `docker compose logs`, with a consistent
 * timestamp + scope prefix instead of ad-hoc console.log calls.
 */
type Fields = Record<string, unknown>;

function format(scope: string, message: string, fields?: Fields): string {
  const time = new Date().toISOString();
  const suffix = fields && Object.keys(fields).length ? " " + JSON.stringify(fields) : "";
  return `${time} [${scope}] ${message}${suffix}`;
}

export function createLogger(scope: string) {
  return {
    info: (message: string, fields?: Fields) => console.log(format(scope, message, fields)),
    warn: (message: string, fields?: Fields) => console.warn(format(scope, message, fields)),
    error: (message: string, fields?: Fields) => console.error(format(scope, message, fields)),
  };
}
