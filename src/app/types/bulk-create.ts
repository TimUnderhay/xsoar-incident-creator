import { FetchedIncidentType } from './fetched-incident-type';
import { DemistoEndpointTestResults } from './demisto-endpoint';
import { FetchedIncidentFieldDefinitions } from './fetched-incident-field';

export interface BulkCreateResult extends Object {
  configId: string;
  skippedFields?: string[];
  success: boolean;
  error?: string;
  incidentId?: number;
  serverId: string;
  jsonFile?: string;
  dbVersion?: number;
}

export interface BulkCreateConfigurationToPush {
  jsonGroupIds?: string;
  jsonGroupNames?: string;
  jsonFileIds?: string;
  jsonFileNames?: string;
  endpointIds?: string;
  endpointNames: string;
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

export interface BulkCreateFetchedIncidentFields {
  [serverId: string]: FetchedIncidentFieldDefinitions;
}

export interface BulkCreateServerTestResults {
  testResults: DemistoEndpointTestResults;
  successfulServerIds: string[]; // contains server id's
  serverIncidentTypes: EndpointIncidentTypes;
  serverIncidentTypeNames: EndpointIncidentTypeNames;
  serverFieldDefinitions: BulkCreateFetchedIncidentFields;
}

export interface BulkCreateRetrieveJSONFilesResults {
  jsonFileIds: JsonFileIds;
  jsonFilesFetchSuccessful: boolean;
}

export interface JsonFileIds {
  [jsonFileId: string]: object; // 'object' is the actual freeform json
}
