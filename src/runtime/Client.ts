import { ClientError } from './errors';
import type { ClientOptions, ClientRequestInit, DownloadDTO, Logger } from './types';

async function defaultResponseHandler(response: Response): Promise<Response> {
  if (!response.ok) {
    let body, json, text;
    try {
      body = await response.text();
      json = JSON.parse(body);
    } catch {
      text = body;
    }
    throw new ClientError(json?.message ?? json?.detail ?? text ?? response.statusText, response.status);
  }
  return response;
}

export class Client {
  protected baseUrl: string;
  protected getAccessToken: () => Promise<string | undefined>;
  protected responseHandler: (response: Response, debugInfo?: object) => Promise<Response>;
  protected logger: Logger;
  protected retries: number;
  protected debug: boolean;

  public constructor(baseUrl: string = '', options?: ClientOptions) {
    this.baseUrl = baseUrl;
    this.getAccessToken = options?.getAccessToken ?? (() => Promise.resolve(undefined));
    this.responseHandler = options?.responseHandler ?? defaultResponseHandler;
    this.logger = options?.logger ?? console;
    this.retries = options?.retries ?? 0;
    this.debug = options?.debug ?? false;
  }

  protected async initRequest(options: ClientRequestInit = {}): Promise<ClientRequestInit> {
    options.headers = new Headers(options.headers);
    if (!options.headers.has('Accept')) {
      options.headers.append('Accept', 'application/json; version=1.0');
    }
    if (options.accessToken) {
      options.headers.append('Authorization', `Bearer ${options.accessToken}`);
    } else {
      const accessToken = await this.getAccessToken();
      if (accessToken) {
        options.headers.append('Authorization', `Bearer ${accessToken}`);
      }
    }
    if (!options?.method) {
      options.method = 'GET';
    }
    return options;
  }

  protected setJsonContentType(options: ClientRequestInit = {}): ClientRequestInit {
    options.headers = new Headers(options.headers);
    if (!options.headers.has('Content-Type')) {
      options.headers.append('Content-Type', 'application/json; charset=utf-8');
    }
    return options;
  }

  public async fetch(path: string, options?: ClientRequestInit): Promise<Response> {
    try {
      const init = await this.initRequest(options);

      if (path.startsWith('/')) {
        path = `${this.baseUrl}${path}`;
      }

      let retryCounter: number = this.retries;
      let response = await fetch(path, init);

      while (init.method === 'GET' && response.status >= 500 && response.status <= 504 && retryCounter > 0) {
        this.logger.warn(`Server response ${response.status}, try again (${this.retries - retryCounter + 1})`);
        response = await fetch(path, init);
        retryCounter--;
      }

      return this.responseHandler(response);
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  public async get<T = any>(path: string, options: ClientRequestInit = {}): Promise<T> {
    const response = await this.fetch(path, options);
    return response.json() as Promise<T>;
  }

  public async post(path: string, body?: object, options?: ClientRequestInit): Promise<void>;
  public async post<T>(path: string, body?: object, options?: ClientRequestInit): Promise<T>;
  public async post<T = void>(path: string, body?: object, options: ClientRequestInit = {}): Promise<T | void> {
    options = this.setJsonContentType(options);
    options.method = 'POST';
    options.body = JSON.stringify(body);
    const response = await this.fetch(path, options);
    if (response.status !== 204) {
      return response.json() as Promise<T>;
    }
  }

  public async put(path: string, body?: object, options?: ClientRequestInit): Promise<void>;
  public async put<T>(path: string, body?: object, options?: ClientRequestInit): Promise<T>;
  public async put<T = void>(path: string, body = {}, options: ClientRequestInit = {}): Promise<T | void> {
    options = this.setJsonContentType(options);
    options.method = 'PUT';
    options.body = JSON.stringify(body);
    const response = await this.fetch(path, options);
    if (response.status !== 204) {
      return response.json() as Promise<T>;
    }
  }

  public async patch(path: string, body?: object, options?: ClientRequestInit): Promise<void>;
  public async patch<T>(path: string, body?: object, options?: ClientRequestInit): Promise<T>;
  public async patch<T = void>(path: string, body = {}, options: ClientRequestInit = {}): Promise<T | void> {
    options = this.setJsonContentType(options);
    options.method = 'PATCH';
    options.body = JSON.stringify(body);
    const response = await this.fetch(path, options);
    if (response.status !== 204) {
      return response.json() as Promise<T>;
    }
  }

  public async delete(path: string, options?: ClientRequestInit): Promise<void>;
  public async delete<T>(path: string, options?: ClientRequestInit): Promise<T>;
  public async delete<T = void>(path: string, options: ClientRequestInit = {}): Promise<T | void> {
    options.method = 'DELETE';
    const response = await this.fetch(path, options);
    if (response.status !== 204) {
      return response.json() as Promise<T>;
    }
  }

  public async upload(path: string, file: Blob, field?: string, options?: ClientRequestInit): Promise<void>;
  public async upload<T>(path: string, file: Blob, field?: string, options?: ClientRequestInit): Promise<T>;
  public async upload<T = void>(
    path: string,
    file: Blob,
    field = 'file',
    options: ClientRequestInit = {},
  ): Promise<T | void> {
    const payload = new FormData();
    payload.append(field, file);
    if (!options.method) {
      options.method = 'POST';
    }
    options.body = payload;
    const response = await this.fetch(path, options);

    if (response.status !== 204) {
      return response.json() as Promise<T>;
    }
  }

  public async download(path: string, filename?: string, options: ClientRequestInit = {}): Promise<DownloadDTO> {
    options.method = 'GET';
    const response = await this.fetch(path, options);
    const data = await response.blob();

    if (!filename) {
      const fileNameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
      const matches = fileNameRegex.exec(response.headers.get('content-disposition') ?? '');
      filename = matches?.[1]?.replace(/['"]/g, '') ?? undefined;
    }

    return { data, filename };
  }
}
