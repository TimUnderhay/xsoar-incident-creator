export interface FileAttachmentConfig {
  // Refers to the saved configuration of a file attachment on the back-end (for saving and opening an attachment itself)
  // but not how they're saved in a saved incident config
  id: string;
  size?: number; // added by server
  detectedType?: string; // added by server
  filename: string;
  mediaFile: boolean; // usually false
  comment: string;
}

export interface FileAttachmentConfigs {
  [ids: string]: FileAttachmentConfig;
}

export interface FileAttachmentUIConfig extends Object {
  // Equivalent of FileAttachmentConfig but stores values for the UI which permits override
  id: string;
  size: number; // added by server
  detectedType: string; // added by server

  filename: string; // overridden filename
  mediaFile: boolean; // overridden mediafile
  comment: string; // overridden comment

  originalFilename: string;
  originalMediaFile: boolean;
  originalComment: string;

  overrideFilename: boolean;
  overrideMediaFile: boolean;
  overrideComment: boolean;
}

export interface AttachmentFieldConfig {
  // Refers to how attachments are saved in an incident config
  id: string; // the attachment config id to use
  filenameOverride?: string;
  mediaFileOverride?: boolean;
  commentOverride?: string;
}

export interface FileToPush {
  // used at incident creation time, when we are building a list of files to push into an incident
  serverId: string; // XSOAR server
  incidentId?: number; // added after incident creation
  incidentFieldName: string; // 'attachment' or other field
  attachmentId: string;
  filename: string;
  mediaFile?: boolean;
  comment?: string;
  last: boolean; // the last item in the FileToPush array will be true, if createInvestigation is true.  This causes the playbook to run
}
