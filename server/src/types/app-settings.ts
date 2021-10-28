export interface AppSettings {
  listenAddress: string;
  listenPort: number;
  developmentProxyDestination?: string;
  jsonBodyUploadLimit: string;
  urlEncodedBodyUploadLimit: string;
}

export type AppSettingsRecord = Record<keyof AppSettings, string | number | undefined>;