export interface BulkCreateResult extends Object {
  configName: string;
  skippedFields?: string[];
  success: boolean;
  error?: string;
  incidentId?: number;
  serverId: string;
}

export interface BulkCreateConfigurationToPush {
  jsonGroups?: string;
  endpoints: string;
}

export interface BulkCreateConfigurationsToPush {
  [configName: string]: BulkCreateConfigurationToPush;
}

export interface BulkCreateSelection {
  jsonGroups: string[];
  endpoints: string[];
}

export interface BulkCreateSelections {
  [index: string]: BulkCreateSelection;
}