export interface BulkCreateResult extends Object {
  configName: string;
  skippedFields?: string[];
  success: boolean;
  error?: string;
  incidentId?: number;
  serverId: string;
}
