import { FieldType, MappingMethod, DateConfig } from './incident-fields';

// These interfaces deal with saved incident configurations

export interface IncidentConfig {
  // an individual incident configuration
  id?: string; // UUIDv4 - added by server
  name: string;
  chosenFields: IncidentFieldsConfig;
  createInvestigation: boolean;
  incidentType: string;
  defaultJsonName?: string; // the json file to load when opening incident
  requiresJson?: boolean; // returned by the server
}

export interface IncidentConfigs {
  // on object for storing multiple incident configs
  [index: string]: IncidentConfig;
}

export interface IncidentFieldsConfig {
  [index: string]: IncidentFieldConfig;
}

export interface IncidentFieldConfig {
  // this is a sort of subset of IncidentField, because the server doesn't
  // need to store all stateful field info
  shortName: string; // longname is loaded live from XSOAR
  custom: boolean; // is the field a custom field?
  fieldType: FieldType;
  enabled: boolean;
  mappingMethod: MappingMethod; // static or jmespath?
  value?: any; // A static value
  jmesPath?: any; // A JMESPath expression
  permitNullValue?: boolean; // permit null values to be included in incident fields?
  dateConfig?: DateConfig; // used by date fields for transformers
}

export interface IncidentJsonFileConfig {
  // for API call to set default JSON name for an incident config
  configName: string; // the incident config name
  jsonName: string | null; // the json config name -- set to null to clear
}

export interface IncidentCreationConfig {
  createInvestigation: boolean;
  serverId: string;
  CustomFields?: {[fieldName: string]: string | number | Object | null};
  [fieldName: string]: string | number | Object | null;

}