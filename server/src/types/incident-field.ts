import { FileAttachmentUIConfig } from './file-attachment';

// This file deals primarily with incidents as they are represented in the UI

export type MappingMethod = 'static' | 'jmespath'; // 'randomised'

export type FieldType = 'shortText' | 'longText' | 'singleSelect' | 'multiSelect' | 'grid' | 'internal' | 'number' | 'date' | 'timer' | 'boolean' | 'url' | 'html' | 'role' | 'attachments' | 'markdown' | 'tagsSelect' | 'user' | 'undefined';

// supportetdTypes: 'shortText', 'longText', 'number', 'url', 'boolean', 'html', 'role', 'singleSelect', 'date', 'user', 'multiSelect', 'markdown', 'grid', 'internal', 'attachments'

// unsupportedTypes: 'undefined', 'timer'

export interface IncidentFieldUI extends Object {
  shortName: string;
  longName?: string;
  enabled?: boolean;
  locked?: boolean;
  lockedReason?: string;
  value?: any;
  jmesPath?: any;
  originalValue?: any;
  fieldType?: FieldType;
  custom: boolean; // used by FieldDisplayComponent
  selectValues?: any; // possible values that the field can hold.  For singleSelect and multiSelect fields
  mappingMethod: MappingMethod;
  permitNullValue?: boolean;
  dateConfig?: DateConfig; // used by date fields
  attachmentConfig?: FileAttachmentUIConfig[];
}

export interface IncidentFieldsUI {
  [index: string]: IncidentFieldUI;
}

export interface DateConfig {
  autoParse?: boolean; // for string values.  Tries to auto-parse the value
  formatter?: string; // formatter string, used only if autoParse = false
  precision?: number; // for numeric values, 1 for second, 1000 for ms, 1000000 for µs, 1000000000 for ns
  utcOffsetEnabled?: boolean;
  utcOffset?: number;
}

export type DatePrecision = 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds';
