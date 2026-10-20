declare module '@tanstack/react-start' {
  export function createStart(config: () => Record<string, unknown>): { handler: unknown };
  export function createMiddleware(options?: { type?: 'function' | 'request' }): {
    client: (fn: (ctx: { next: (opts?: { headers?: Record<string, string> }) => Promise<unknown> }) => Promise<unknown>) => unknown;
    server: (fn: (ctx: { next: (opts?: { context?: Record<string, unknown> }) => Promise<unknown> }) => Promise<unknown>) => unknown;
  };
  export function createCsrfMiddleware(options?: { filter?: (ctx: unknown) => boolean }): unknown;
}

declare module '@tanstack/react-start/server' {
  export function getRequest(): Request | undefined;
}

declare module '@tanstack/react-start/server-entry' {
  const entry: {
    fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
  };
  export default entry;
}
