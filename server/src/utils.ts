import * as os from 'os';
import * as util from 'util';
import * as fs from 'fs';
import { exec as ExecSync } from 'child_process';
import mvsync from 'mv';
import { AppSettings, AppSettingsRecord } from 'types/app-settings';
import { DefaultSettings } from './default-settings';
import NodeRSA from 'node-rsa';
import { v4 as uuidv4 } from 'uuid';
import express, { Request, Response, NextFunction } from 'express';
// import request from 'request-promise-native';
import multer from 'multer';
import proxy from 'express-http-proxy';
import httpProxy from 'http-proxy';
import https from 'https';
import * as Errors from './types/errors';
import { DemistoEndpoint, DemistoEndpoints, SavedDemistoEndpoint } from 'types/demisto-endpoint';
import { IncidentConfig, IncidentConfigs, IncidentFieldConfig, IncidentFieldsConfig } from 'types/incident-config';
import { FileAttachmentConfigs, FileAttachmentConfig } from 'types/file-attachment';
import { JsonGroup, JsonGroups } from 'types/json-group';
import { FetchedIncidentField, FetchedIncidentFieldDefinitions } from 'types/fetched-incident-field';
import Axios, { AxiosRequestConfig, AxiosResponse, AxiosPromise } from 'axios';
import { users } from './definitions/users';

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