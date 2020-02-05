// For fields pulled from Demisto
export interface DemistoIncidentField {
  associatedToAll: boolean;
  associatedTypes: string[];
  breachScript: string;
  caseInsensitive: boolean;
  cliName: string;
  closeForm: boolean;
  columns: any; // is null in my source
  commitMessage: string;
  content: boolean;
  defaultRows: any; // is null in my source
  description: string;
  editForm: boolean;
  fieldCalcScript: string;
  group: number;
  hidden: boolean;
  id: string;
  isReadOnly: boolean;
  locked: string;
  modified: string;
  name: string;
  neverSetAsRequired: boolean;
  ownerOnly: boolean;
  placeholder: string;
  prevName: string;
  required: boolean;
  script: string;
  selectValues: any; // is null in my source
  shouldCommit: boolean;
  sla: number;
  sortValues: any; // is null in my source
  system: boolean;
  systemAssociatedTypes: any; // is null in my source
  threshold: number;
  type: string;
  unmapped: boolean;
  unsearchable: boolean;
  useAsKpi: boolean;
  validatedError: string;
  validationRegex: string;
  vcShouldIgnore: boolean;
  version: 3;
}

export interface DemistoIncidentFieldDefinitions {
  [index: string]: DemistoIncidentField;
}
