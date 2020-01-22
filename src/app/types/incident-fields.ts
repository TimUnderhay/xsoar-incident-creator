export interface IncidentField {
  shortName: string;
  longName?: string;
  enabled?: boolean;
  locked?: boolean;
  lockedReason?: string;
  value: any;
  originalValue: any;
  fieldType?: string; // "shortText", "singleSelect", "multiSelect", "grid", "internal", "number", "longText", "date", "timer", "boolean", "url", "html", "role"
  custom: boolean; // used by FieldDisplayComponent
}

export interface IncidentFields {
  [index: string]: IncidentField;
}
