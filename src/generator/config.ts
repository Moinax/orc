export interface ClientConfig {
  name: string;
  spec: string;
  output: string;
  stripPathPrefix?: string;
  schemaPrefix?: string;
  /**
   * Path patterns to skip during resource generation. Useful for endpoints
   * that don't fit the request/response JSON model (e.g. SSE streams handled
   * by the Vercel AI SDK). A string matches a path exactly; a RegExp is
   * tested against the path. Patterns are checked against the spec's path
   * pattern *after* `stripPathPrefix` is applied.
   */
  exclude?: Array<string | RegExp>;
}

export interface OrcConfig {
  clients: ClientConfig[];
  runtimePackage?: string;
}

export function defineConfig(config: OrcConfig): OrcConfig {
  return config;
}
