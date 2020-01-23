export interface BulkCreateResult {
  configName: string;
  skippedFields?: string[];
  success: boolean;
  error?: string;
  incidentId?: number;
}
