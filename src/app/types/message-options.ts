// For the glaring omission of a typedef for PrimeNG's messages component

export interface PMessageOption {
  severity: 'info' | 'success' | 'warn' | 'error';
  summary: string;
  detail: string;
}
