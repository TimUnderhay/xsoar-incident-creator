import { inherits } from 'util';

export type FieldType = 'shortText' | 'longText' | 'singleSelect' | 'multiSelect' | 'grid' | 'internal' | 'number' | 'date' | 'timer' | 'boolean' | 'url' | 'html' | 'role' | 'attachments' | 'markdown' | 'tags' | 'user' | 'undefined';

// supportetdTypes: 'shortText', 'longText', 'number', 'url', 'boolean', 'html', 'role', 'singleSelect', 'date', 'user', 'multiSelect', 'markdown', 'grid', 'internal', 'timer', 'attachments'

// unsupportedTypes: 'undefined', 'user', 'tags'

export interface IncidentField extends Object {
  shortName: string;
  longName?: string;
  enabled?: boolean;
  locked?: boolean;
  lockedReason?: string;
  value: any;
  originalValue: any;
  fieldType?: FieldType;
  custom: boolean; // used by FieldDisplayComponent
  selectValues?: any; // possible values that the field can hold.  For singleSelect and multiSelect fields 
}

export interface IncidentFields {
  [index: string]: IncidentField;
}
