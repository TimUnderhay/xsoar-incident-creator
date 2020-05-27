export interface FileAttachmentConfig {
  id: string;
  filename: string;
  mediaFile: boolean; // usually false
  comment?: string;
  size?: number; // added by server
  detectedType?: string; // added by server
}

export interface FileAttachmentConfigs {
  [ids: string]: FileAttachmentConfig;
}
