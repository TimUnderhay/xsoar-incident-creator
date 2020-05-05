import { MappingMethod } from '../freeform-json-row.component';

export type FieldType = 'shortText' | 'longText' | 'singleSelect' | 'multiSelect' | 'grid' | 'internal' | 'number' | 'date' | 'timer' | 'boolean' | 'url' | 'html' | 'role' | 'attachments' | 'markdown' | 'tagsSelect' | 'user' | 'undefined';

// supportetdTypes: 'shortText', 'longText', 'number', 'url', 'boolean', 'html', 'role', 'singleSelect', 'date', 'user', 'multiSelect', 'markdown', 'grid', 'internal', 'attachments'

// unsupportedTypes: 'undefined', 'timer'

export interface IncidentField extends Object {
  shortName: string;
  longName?: string;
  enabled?: boolean;
  locked?: boolean;
  lockedReason?: string;
  value?: any;
  jmesPath?: any;
  originalValue: any;
  fieldType?: FieldType;
  custom: boolean; // used by FieldDisplayComponent
  selectValues?: any; // possible values that the field can hold.  For singleSelect and multiSelect fields 
  mappingMethod?: MappingMethod;
  permitNullValue?: boolean;
}

export interface IncidentFields {
  [index: string]: IncidentField;
}
