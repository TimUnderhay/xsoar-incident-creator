import { FetchedIncidentType } from './fetched-incident-types';

export interface BulkCreateResult extends Object {
  configName: string;
  skippedFields?: string[];
  success: boolean;
  error?: string;
  incidentId?: number;
  serverId: string;
  jsonFile?: string;
}

export interface BulkCreateConfigurationToPush {
  jsonGroups?: string;
  jsonConfigs?: string;
  endpoints: string;
  incidentConfigName: string;
}

export interface BulkCreateSelection {
  jsonGroups: string[]; // sadly, contains both groups and files.  groups are prefixed with a 'g' and files with a 'j'
  jsonFiles?: string[]; // all resolved json files (individual and those taken from groups)
  endpoints: string[];
  successfulEndpoints?: string[];
  failedEndpoints?: string[];
}

export interface BulkCreateSelections {
  [index: string]: BulkCreateSelection;
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
