import { Client } from './Client';

export class Resource<T extends Client = Client> {
  protected client: T;

  constructor(client: T) {
    this.client = client;
  }
}
