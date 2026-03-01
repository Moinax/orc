export interface ClientConfig {
  name: string;
  spec: string;
  output: string;
  stripPathPrefix?: string;
}

export interface OrcConfig {
  clients: ClientConfig[];
  runtimePackage?: string;
}

export function defineConfig(config: OrcConfig): OrcConfig {
  return config;
}
