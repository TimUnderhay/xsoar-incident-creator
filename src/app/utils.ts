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



export function firstSimpleChange(field: string, values: SimpleChanges): boolean {
  const found = field in values;
  const isFirstChange = found && values[field].isFirstChange();
  return isFirstChange;
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



export function sPlural(value: any[]): string {
  return value.length !== 1 ? 's' : '';
}



export function werePlural(value: any[]): string {
  return value.length !== 1 ? 'were' : 'was';
}



export function sortArrayAlphabetically(a, b): number {
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}



export function sortArrayNaturally(as, bs): number {
  // taken from https://snipplr.com/view/36012/javascript-natural-sort
  // tslint:disable-next-line:one-variable-per-declaration
  let a, b, a1, b1, rx = /(\d+)|(\D+)/g, rd = /\d+/;
  a = String(as).toLowerCase().match(rx);
  b = String(bs).toLowerCase().match(rx);
  while (a.length && b.length){
    a1 = a.shift();
    b1 = b.shift();
    if (rd.test(a1) || rd.test(b1)){
      if (!rd.test(a1)) {
        return 1;
      }
      if (!rd.test(b1)) {
        return -1;
      }
      if (a1 !== b1) {
        return a1 - b1;
      }
    }
    else if (a1 !== b1) {
      return a1 > b1 ? 1 : -1;
    }
  }
  return a.length - b.length;
}



export function massageData(value, fieldType) {
  console.log(`massageData(): fieldType: ${fieldType}, value:`, value);

  switch (fieldType) {
    case 'number':
      return toNumber(value);
    case 'shortText':
      return toString(value);
    case 'longText':
      return toString(value);
    case 'boolean':
      return toBoolean(value);
    case 'grid':
      return toGrid(value);
    case 'url':
      return toString(value);
    case 'html':
      return toString(value);
    case 'markdown':
      return toString(value);
    case 'role':
      return toStringArray(value);
    case 'user':
      return toString(value);
    case 'singleSelect':
      return toString(value);
    case 'multiSelect':
      return toStringArray(value);
    case 'date':
      if (typeof value === 'string' && value.match(/^\d+$/)) {
        // convert string-wrapped numbers to type Number
        value = Number(value);
      }
      return value;
    case 'internal':
      // FINISH ME!!!
      return value;
    case 'tagsSelect':
      // FINISH ME!!!
      return value;
  }
}
