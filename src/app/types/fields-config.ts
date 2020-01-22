import { IncidentFields, IncidentField } from './incident-fields';

export interface FieldConfig {
  id?: string; // UUIDv4 - added by server
  name: string;
  incident: any; // the original file JSON
  customFieldsConfig: IncidentFieldsConfig;
  incidentFieldsConfig: IncidentFieldsConfig;
  createInvestigation: boolean;
}

export interface FieldsConfig {
  [index: string]: FieldConfig;
}

export interface IncidentFieldConfig {
  shortName: string;
  enabled: boolean;
  value: any;
}

export interface IncidentFieldsConfig {
  [index: string]: IncidentFieldConfig;
}
