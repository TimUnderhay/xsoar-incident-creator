import { inherits } from 'util';

export type FieldType = 'shortText' | 'longText' | 'singleSelect' | 'multiSelect' | 'grid' | 'internal' | 'number' | 'date' | 'timer' | 'boolean' | 'url' | 'html' | 'role' | 'attachments' | 'undefined';

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
