export interface DemistoEndpoint {
  id?: string; // added by server
  url: string;
  apiKey?: string;
  trustAny: boolean;
}

export interface DemistoEndpoints {
  [index: string]: DemistoEndpoint;
}
