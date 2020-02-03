export interface DemistoAPI {
  url: string;
  apiKey?: string;
  trustAny: boolean;
  serverId?: string; // for when we want the server to provide the apiKey from an existing definition during a test
}

export interface DemistoAPIEndpoints {
  [index: string]: DemistoAPI;
}
