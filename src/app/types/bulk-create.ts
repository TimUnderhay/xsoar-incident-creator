import { FetchedIncidentType } from './fetched-incident-types';

export interface BulkCreateResult extends Object {
  configId: string;
  skippedFields?: string[];
  success: boolean;
  error?: string;
  incidentId?: number;
  serverId: string;
  jsonFile?: string;
}

export interface BulkCreateConfigurationToPush {
  jsonGroupIds?: string;
  jsonGroupNames?: string;
  jsonFileIds?: string;
  jsonFileNames?: string;
  endpoints: string;
  incidentConfigId: string;
}

export interface BulkCreateSelection {
  jsonSelections: string[]; // sadly, contains both groups and files, as they are selected together.  groups are prefixed with a 'g_' and files with a 'j_'
  jsonFileIds?: string[]; // all resolved json file id's (individual and those taken from groups)
  endpoints: string[];
  successfulEndpoints?: string[];
  failedEndpoints?: string[];
}

export interface BulkCreateSelections {
  [incidentConfigId: string]: BulkCreateSelection;
}

export interface EndpointIncidentTypes {
  [serverId: string]: FetchedIncidentType[];
}

export interface EndpointIncidentTypeNames {
  [serverId: string]: string[];
}

export interface BulkCreateIncidentJSON {
  [serverId: string]: { [incidentId: number]: object }; // Object is incident JSON
}
