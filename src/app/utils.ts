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



export function toString(value) {
  if (typeof value === 'string') {
    return value;
  }
  return `${value}`;
}



export function toBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  else if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      return true;
    }
    else if (value.toLowerCase() === 'false') {
      return false;
    }
    return undefined;
  }
  else if (['number', 'bigint'].includes(typeof value) ) {
    if (value <= 0) {
      return false;
    }
    return true;
  }
  return null;
}



export function toNumber(value) {
  if (typeof value === 'number') {
    return value;
  }
  else if (typeof value === 'string') {
    if ((value as string).match(/^\d+(?:\.\d+)?$/)) {
      return parseFloat(value);
    }
    return null;
  }
  return null;
}



export function isArray(value): boolean {
  if (typeof value === 'object' && Array.isArray(value)) {
    return true;
  }
  return false;
}



export function toStringArray(value) {
  // roles must be an array of strings
  if (typeof value === 'string') {
    return [value];
  }
  else if (isArray(value)) {
    for (let item of value) {
      if (!(typeof item === 'string')) {
        // we don't want non-string arrays
        return null;
      }
    }
    return value;
  }
  return null;
}



export function toGrid(value) {
  if (isArray(value)) {
    // we won't perform any more validation other than is it an array
    return value;
  }
  else if (typeof value === 'object') {
    return [value];
  }

}