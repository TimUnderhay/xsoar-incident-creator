import https from 'https';
import { IncidentConfigs } from 'types/incident-config';
import { AxiosRequestConfig } from 'axios';

export const isArray = (value: unknown): boolean => {
  if (typeof value === 'object' && Array.isArray(value)) {
    return true;
  }
  return false;
}

export const validateJsonGroup = (jsonFileIds: unknown[]) => {
  console.log('validateJsonGroup()');
  if (!isArray(jsonFileIds)) {
    throw `jsonFileIds is not an array`;
  }
  for (const value of jsonFileIds) {
    const valueType = typeof value;
    if (valueType !== 'string') {
      throw `jsonFileIds contains non-string values`;
    }
  }
}

export const checkForRequiredFields = (fields: string[], body: Record<any, unknown>): void => {
  for (const fieldName of fields) {
    if (!(fieldName in body)) {
      throw `${fieldName}`;
    }
  }
}



export const checkBodyForKeys = (keys: string[], body: Record<any, unknown>) => {
  let success = true;
  for (let i = 0; i < keys.length; i++) {
    let key = keys[i];

    if (!(key in body)) {
      console.error(`Client body was missing key "${key}"`);
      success = false;
    }
  }
  return success;
}



export const keysToLower = (obj: Record<any, unknown>): Record<any, unknown> => {
  let key;
  let keys = Object.keys(obj);
  let n = keys.length;
  let newobj: Record<any, unknown> = {};
  while (n--) {
    key = keys[n];
    if (typeof key === 'string') {
      newobj[key.toLowerCase()] = obj[key];
    }
    else {
      newobj[key] = obj[key];
    }
  }
  return newobj;
}



export const removeNullValues = (obj: Record<any, unknown>): Record<any, unknown> => {
  let key;
  let keys = Object.keys(obj);
  let n = keys.length;
  let newobj: Record<any, unknown> = {};
  while (n--) {
    key = keys[n];
    if (obj[key] !== null ) {
      newobj[key.toLowerCase()] = obj[key];
    }
  }
  return newobj;
}



export const removeEmptyValues = <T>(obj: any) => {
  let key;
  let keys = Object.keys(obj);
  let n = keys.length;
  let newobj: Record<any, unknown> = {};
  while (n--) {
    key = keys[n];
    if (obj[key] !== '' ) {
      newobj[key.toLowerCase()] = obj[key];
    }
  }
  return newobj;
}



export const dos2unix = (str: string): string => str.replace(/\r\n/g, '\n');



export const prettyJsonStringify = (json: Record<any, any> | unknown[]): string => JSON.stringify(json, null, 2);



export const calculateRequiresJson = (incidentsConfig: IncidentConfigs): IncidentConfigs => {
  for (const incidentConfig of Object.values(incidentsConfig)) {
    let requiresJson = false;
    for (const field of Object.values(incidentConfig.chosenFields)) {
      if (field.mappingMethod === 'jmespath' && field.jmesPath !== '' && !field.permitNullValue) {
        requiresJson = true;
        break;
      }
    }
    incidentConfig.requiresJson = requiresJson;
  }
  return incidentsConfig;
}



export const sanitiseObjectFromValidKeyList = (validKeys: string[], obj: any) => {
  const newObj: any = {};
  for (const key of validKeys) {
    if (key in obj) {
      newObj[key] = obj[key];
    }
  }
  return newObj;
}


export const addAxiosProxy = (requestOptions: AxiosRequestConfig, urlStr: string): AxiosRequestConfig => {
  const url = new URL(urlStr);
  requestOptions.proxy = {
    host: url.host,
    port: parseInt(url.port),
    protocol: url.protocol
  };
  if (url.username || url.password) {
    requestOptions.proxy.auth = {
      username: url.username,
      password: url.password
    };
  }
  return requestOptions;
}



export const getAxiosHTTPSAgent = (trustAny: boolean): https.Agent => {
  return new https.Agent({rejectUnauthorized: !trustAny});
};



export const getFormDataFromObject = (obj: Record<string, string | Blob>): FormData => {
  const formData = new FormData();
  for (const [key, value] of Object.entries(obj)) {
    formData.append(key, value);
  }
  return formData;
};