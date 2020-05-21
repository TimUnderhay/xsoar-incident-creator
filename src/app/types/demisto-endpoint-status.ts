export interface DemistoEndpointTestResult {
  success: boolean;
  statusCode?: number;
  error?: boolean;
}

export interface DemistoEndpointTestResults {
  [serverId: string]: DemistoEndpointTestResult;
}
