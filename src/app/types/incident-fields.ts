export interface IncidentField {
  shortName: string;
  longName?: string;
  enabled?: boolean;
  locked?: boolean;
  lockedReason?: string;
  value: any;
  originalValue: any;
  fieldType?: string; // "shortText", "singleSelect", "multiSelect", "grid", "internal", "number", "longText", "date", "timer", "boolean", "url", "html", "role"
  custom: boolean; // always true -- used by FieldDisplayComponent
}

export interface IncidentFields {
  [index: string]: IncidentField;
}

export interface CustomField {
  shortName: string;
  longName?: string;
  enabled?: boolean;
  locked?: boolean;
  lockedReason?: string;
  value: any;
  originalValue: any;
  fieldType?: string;
  custom: boolean; // always false -- used by FieldDisplayComponent
}

export interface CustomFields {
  [index: string]: CustomField;
}
