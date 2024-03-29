export interface DemistoEndpoint {
  id?: string; // added by server
  url: string;
  apiKey?: string;
  trustAny: boolean;
  proxy?: string;
}

export interface DemistoEndpoints {
  [serverId: string]: DemistoEndpoint;
}

export interface DemistoEndpointTestResult {
  success: boolean;
  statusCode?: number;
  error?: boolean;
}

export interface DemistoEndpointTestResults {
  [serverId: string]: DemistoEndpointTestResult;
}

export interface DefaultDemistoEndpoint {
  defined: boolean;
  serverId?: string;
}
