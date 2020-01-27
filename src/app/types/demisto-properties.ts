export interface DemistoAPI {
  url: string;
  apiKey: string;
  trustAny: boolean;
}

export interface DemistoAPIEndpoints {
  [index: string]: DemistoAPI;
}
