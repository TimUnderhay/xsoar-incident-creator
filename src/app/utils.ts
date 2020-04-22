import { SimpleChanges } from '@angular/core';

export function isJsonValid(value: any) {
  try {
    JSON.stringify(value);
    return true;
  }
  catch {
    return false;
  }
}



export function firstOrChangedSimpleChange(field: string, values: SimpleChanges): boolean {
  const found = field in values;
  const isFirstChange = found && values[field].isFirstChange();
  const valueChanged = found && !isFirstChange && values[field].currentValue !== values[field].previousValue;
  return isFirstChange || valueChanged;
}



export function changedSimpleChange(field: string, values: SimpleChanges): boolean {
  const found = field in values;
  const isFirstChange = found && values[field].isFirstChange();
  const valueChanged = found && !isFirstChange && values[field].currentValue !== values[field].previousValue;
  return !isFirstChange && valueChanged;
}