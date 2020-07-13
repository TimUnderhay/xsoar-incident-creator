// For incident types fetched from Demisto
export interface FetchedIncidentType {
  id: string;
  version: number;
  modified: string;
  sortvalues: any;
  propagationLabels: string[];
  vcShouldIgnore: boolean;
  commitMessage: string;
  shouldCommit: false;
  locked: false;
  name: string;
  prevName: string;
  color: string;
  sla: number;
  playbookId: string;
  hours: number;
  days: number;
  weeks: number;
  hoursR: number;
  daysR: number;
  weeksR: number;
  system: false;
  readonly: false;
  default: false;
  autorun: true;
  preProcessingScript: string;
  closureScript: string;
  disabled: false;
  reputationCalc: number;
}
