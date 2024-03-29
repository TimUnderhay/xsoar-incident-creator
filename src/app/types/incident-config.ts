import { FieldType, MappingMethod, DateConfig } from './incident-field';
import { AttachmentFieldConfig } from './file-attachment';

// These interfaces deal with saved incident configurations

export interface IncidentConfig {
  // an individual incident configuration as stored on the back end
  id?: string; // UUIDv4 - added by server
  name: string;
  chosenFields: IncidentFieldsConfig;
  createInvestigation: boolean;
  incidentType: string;
  defaultJsonId?: string; // the json file id to load when opening incident
  defaultJsonGroupId?: string; // the json file id to load when opening incident
  requiresJson?: boolean; // returned by the server
}

export interface IncidentFieldConfig {
  // This represents individual incident fields (in IncidentConfig.chosenFields), as it is saved in an incident config
  shortName: string; // longname is loaded live from XSOAR
  custom: boolean; // is the field a custom field?
  fieldType: FieldType;
  enabled: boolean;
  mappingMethod: MappingMethod; // static or jmespath?
  value?: any; // A static value
  jmesPath?: any; // A JMESPath expression
  permitNullValue?: boolean; // permit null values to be included in incident fields?
  dateConfig?: DateConfig; // used by date fields for transformers
  attachmentConfig?: AttachmentFieldConfig[];
}

export interface IncidentConfigs {
  // an object for storing multiple incident configs
  [id: string]: IncidentConfig;
}

export interface IncidentFieldsConfig {
  [index: string]: IncidentFieldConfig;
}

export interface IncidentJsonFileConfig {
  // for API call to set default JSON id for an incident config
  incidentConfigId: string; // the incident config ID
  jsonId: string | null; // the json config id -- set to null to clear
}

export interface IncidentJsonGroupConfig {
  // for API call to set default JSON group for an incident config
  incidentConfigId: string; // the incident config ID
  jsonGroupId: string | null; // the json config id -- set to null to clear
}

export interface IncidentCreationConfig {
  createInvestigation: boolean;
  serverId: string;
  CustomFields?: {[fieldName: string]: string | number | object | null | boolean};
  [fieldName: string]: string | number | object | null | boolean;
}
