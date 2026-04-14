export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface ClientRequestInit extends RequestInit {
  headers?: Headers;
  accessToken?: string;
}

export interface ClientOptions {
  getAccessToken?: () => Promise<string | undefined>;
  responseHandler?: (response: Response, path?: string, init?: RequestInit) => Promise<Response>;
  logger?: Logger;
  retries?: number;
  debug?: boolean;
}

export interface DownloadDTO {
  data: Blob;
  filename?: string;
}
