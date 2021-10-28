'use strict';
import SourceMapSupport from 'source-map-support';
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
import * as utils from './utils';
import { Console } from 'console';

SourceMapSupport.install();
const exec = util.promisify(ExecSync);
const mv = util.promisify(mvsync);
const streamToBlob = require('stream-to-blob');


////////////////////// Config and Imports //////////////////////


try {
  var Version = JSON.parse(fs.readFileSync('../package.json', { encoding: 'utf8' })).version;
}
catch (error: any) {
  var Version = JSON.parse(fs.readFileSync('../../package.json', { encoding: 'utf8' })).version;
}
const BuildNumber = JSON.parse(fs.readFileSync('../build.json', { encoding: 'utf8' })).buildNumber;
console.log(`XSOAR Incident Creator server version ${Version}${BuildNumber === 0 ? '' : ' build ' + BuildNumber} is starting`);

const SchemaVersion = 1;

// Files / Directories
const configDir = '../etc';
const settingsFile = `settings.json`;
const defsDir = `./definitions`; // contains static user definitions
const sampleIncidentsDir = `${configDir}/incidents`; // not used in prod
const staticDir = '../../dist/xsoar-incident-creator'; // where to find pre-built Angular client files

// Settings
let appSettings = loadIncidentCreatorSettings(configDir, settingsFile);

// Config parameters
const apiPath = '/api';

// XSOAR API Config
let demistoEndpointConfigs: DemistoEndpoints = {};
let defaultDemistoEndpointId: string | undefined; // the ID of the default demistoApiConfig

// Files
const apiCfgFile = `${configDir}/servers.json`;
const incidentsFile = `${configDir}/incidents.json`;
const freeJsonFile = `${configDir}/json.json`;
const jsonGroupsFile = `${configDir}/json-groups.json`;
const attachmentsFile = `${configDir}/attachments.json`;
const attachmentsDir = `${configDir}/attachments`; // contains arbitrary file attachments of any file type
const uploadsDir = `../uploads`; // we don't want this in /etc

// Certificates
const sslDir = `${configDir}/certs`;
const certFile = `${sslDir}/cert.pem`;
let sslCert;
const privKeyFile = `${sslDir}/cert.key`;
let privKey: string;
const internalPubKeyFile = `${sslDir}/internal.pem`;
let internalPubKey: string;
const internalKeyFile = `${sslDir}/internal.key`;

// encryption
let encryptor: NodeRSA;

// Incidents Config
let incidentsConfig: IncidentConfigs = {};
let incident_fields: FetchedIncidentFieldDefinitions = {};

// Freeform JSON Config
let freeJsonConfig: Record<any, any> = {};

// JSON Groups Config
let jsonGroupsConfig: JsonGroups = {};

// Attachments Config
let attachmentsConfig: FileAttachmentConfigs = {};



// Load Sample Users
// const users = require(defsDir + '/users');
const randomElement = <T>(list: T[]): T => {
  console.log('randomElement()');
  // randomly return any array element
  let num = Math.floor(Math.random() * list.length);
  return list[num];
}

// Parse args
const devMode = process.argv.includes('--dev');

// Express
const app = express();
app.use(express.json({ limit: appSettings.jsonBodyUploadLimit}));
app.use(express.urlencoded({ extended: true, limit: appSettings.urlEncodedBodyUploadLimit }));
let server: https.Server;

// Multipart form data handler
const multipartUploadHandler = multer({ dest: `${uploadsDir}/` });


// Logging
const logConnection = (req: Request, res: Response, next: NextFunction) => {
  // logs new client connections to the console
  let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  if (req.url.startsWith(apiPath) ) {
   console.log(`${req.method} ${req.url} from ${ip}`);
  }
  next();
}
app.use(logConnection);


////////////////////// Support Functions //////////////////////







const saveFreeJsonConfig = (): Promise<void> => {
  const savedConfig = {
    schema: SchemaVersion,
    jsonConfigs: Object.values(freeJsonConfig)
  };
  return fs.promises.writeFile(freeJsonFile, JSON.stringify(savedConfig, null, 2), { encoding: 'utf8', mode: 0o660});
}



const saveJsonGroupsConfig = (): Promise<void> => {
  const savedConfig = {
    schema: SchemaVersion,
    jsonGroups: Object.values(jsonGroupsConfig)
  };
  return fs.promises.writeFile(jsonGroupsFile, JSON.stringify(savedConfig, null, 2), { encoding: 'utf8', mode: 0o660});
}



const saveApiConfig = async (): Promise<void> => {
  const apiConfig: SavedDemistoEndpoint = {
    schema: SchemaVersion,
    endpointConfig: {
      servers: Object.values(demistoEndpointConfigs)
    }
  };
  if (defaultDemistoEndpointId) {
    apiConfig.endpointConfig.default = defaultDemistoEndpointId;
  }
  return fs.promises.writeFile(apiCfgFile, JSON.stringify(apiConfig, null, 2), { encoding: 'utf8', mode: 0o660} );
}



const saveAttachmentsConfig = async (): Promise<void> => {
  const savedConfig = {
    schema: SchemaVersion,
    attachments: Object.values(attachmentsConfig)
  }
  return fs.promises.writeFile(attachmentsFile, JSON.stringify(savedConfig, null, 2), { encoding: 'utf8', mode: 0o660} );
}



const deleteFileAttachment = async (filename: string): Promise<void> => {
  return fs.promises.unlink(`${attachmentsDir}/${filename}`);
}



const removeAttachmentFromIncidents = async(attachmentId: string): Promise<void> => {
  let save = false;
  for (const incident of Object.values(incidentsConfig)) {
    // loop through saved incidents

    for (const field of Object.values(incident.chosenFields)) {
      // loop through chosen incident fields

      if ((field.fieldType === 'attachments' || field.shortName === 'attachment') && 'attachmentConfig' in field) {

        if (field.attachmentConfig) {
          
          for (let i = field.attachmentConfig.length - 1; i >= 0; i--) {
            // loop backwards through attachmentConfig
            const attachment = field.attachmentConfig[i];
            if (attachment.id === attachmentId) {
              field.attachmentConfig.splice(i, 1);
              save = true;
              break;
            }
          }

        }
      }
    }
  }
  if (save) {
    await saveIncidentsConfig();
  }
}



const uploadAttachmentToDemisto = async (serverId: string, incidentId: number, incidentFieldName: string, attachmentId: string, filename: string, last: number, mediaFile?: string, comment?: string): Promise<AxiosResponse> => {

  const originalAttachment = attachmentsConfig[attachmentId];
  const diskFilename = `${attachmentsDir}/${attachmentId}`;

  const demistoEndpointConfig = getDemistoEndpointConfig(serverId);
  
  
  const formDataObj: Record<string, string | Blob> = {
    id: `${incidentId}`,
    field: incidentFieldName,
    file: await streamToBlob(fs.createReadStream(diskFilename)),
    fileName: filename,
    last: `${last}`
  };
  if (mediaFile) {
    formDataObj.showMediaFile = `${mediaFile}`;
  }
  if (comment) {
    formDataObj.fileComment = comment;
  }

  // console.log('uploadAttachmentToDemisto(): formData:', formData);
  
  const options: AxiosRequestConfig = {
    url: `${demistoEndpointConfig.url}/incident/upload/${incidentId}`,
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data',
      Authorization: decrypt(demistoEndpointConfig.apiKey),
      Accept: 'application/json'
    },
    httpsAgent: utils.getAxiosHTTPSAgent(demistoEndpointConfig.trustAny),
    // resolveWithFullResponse: true,
    // json: true,
    timeout: 2000,
    data: utils.getFormDataFromObject(formDataObj),
  }
  // return request( addHttpProxy(options, serverId) );  // request returns a promise
  return Axios( addHttpProxy(options, serverId) );
}



const testApi = async (url: string, apiKey: string, trustAny: boolean, proxy?: string) => {
  let options: AxiosRequestConfig = {
    url: url + '/user',
    method: 'GET',
    headers: {
      Authorization: apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    httpsAgent: utils.getAxiosHTTPSAgent(trustAny),
    timeout: 2000
  }
  if (proxy) {
    options = utils.addAxiosProxy(options, proxy);
  }
  try {
    // const result = await request( options );
    const result = await Axios(options);
    return { success: true, result }
  }
  catch(error: any) {
    // console.error(error);
    const res: any = {
      success: false
    };
    if ('response' in error && error.response !== undefined && 'statusMessage' in error.response) {
      res['error'] = error.response.statusMessage
    }
    else if ('message' in error) {
      res['error'] = error.message;
    }
    if ('statusCode' in error) {
      res['statusCode'] = error.statusCode;
    }
    return res;
  }
}



const getDemistoEndpointConfig = (serverId: string): DemistoEndpoint => {
  return demistoEndpointConfigs[serverId];
}



const addHttpProxy = (requestOptions: AxiosRequestConfig, serverId: string): AxiosRequestConfig => {
  const demistoServerConfig = getDemistoEndpointConfig(serverId);
  if (demistoServerConfig.proxy !== undefined) {
    return utils.addAxiosProxy(requestOptions, demistoServerConfig.proxy);
  }
  return requestOptions;
}



const fetchIncidentFields = async (serverId: string): Promise<FetchedIncidentField[] | undefined> => {
  // This method will get incident field definitions from a XSOAR server
  const demistoServerConfig = getDemistoEndpointConfig(serverId);

  console.log(`Fetching incident fields from '${demistoServerConfig.url}'`);

  const options: AxiosRequestConfig = {
    url: demistoServerConfig.url + '/incidentfields',
    method: 'GET',
    headers: {
      Authorization: decrypt(demistoServerConfig.apiKey),
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    // rejectUnauthorized: !demistoServerConfig.trustAny,
    httpsAgent: utils.getAxiosHTTPSAgent(demistoServerConfig.trustAny)
  }

  try {
    // send request to XSOAR
    // result = await request( addHttpProxy(options, serverId) );
    const result = await (Axios( addHttpProxy(options, serverId) ) as AxiosPromise<FetchedIncidentField[]>);

    // 'result' contains non-incident fields, as well, so let's make a version containing only incident fields
    const fields = result.data.filter(field => 'id' in field && field.id.startsWith('incident_'));

    // console.log(fields);

    console.log(`Successfully fetched incident fields from '${demistoServerConfig.url}'`);
    return fields;
  }
  catch (error: any) {
    if ('message' in error) {
      console.error('Caught error fetching XSOAR fields configuration:', error.message);
      return;
    }
    console.error('Caught error fetching XSOAR fields configuration:', error);
  }
}



const getIncidentTypes = async (serverId: string) => {
// This method will get incident type definitions from an XSOAR server

  const demistoServerConfig = getDemistoEndpointConfig(serverId);

  console.log(`Fetching incident types from '${demistoServerConfig.url}'`);

  let result;
  let options: AxiosRequestConfig = {
    url: demistoServerConfig.url + '/incidenttype',
    method: 'GET',
    headers: {
      Authorization: decrypt(demistoServerConfig.apiKey),
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    // rejectUnauthorized: !demistoServerConfig.trustAny,
    httpsAgent: utils.getAxiosHTTPSAgent(demistoServerConfig.trustAny)
  }

  try {
    // send request to XSOAR
    // result = await request( addHttpProxy(options, serverId) );
    result = await Axios( addHttpProxy(options, serverId) );

    // console.log(fields);

    console.log(`Successfully fetched incident types from '${demistoServerConfig.url}'`);
    return result.data;
  }
  catch (error: any) {
    if ('message' in error) {
      console.error('Caught error fetching XSOAR types configuration:', error.message);
      return;
    }
    console.error('Caught error fetching XSOAR types configuration:', error);
  }
}



const saveIncidentsConfig = () => {
  incidentsConfig = utils.calculateRequiresJson(incidentsConfig);
  const savedConfig = {
    schema: SchemaVersion,
    incidentConfigs: Object.values(incidentsConfig)
  };
  return fs.promises.writeFile(incidentsFile, JSON.stringify(savedConfig, null, 2), { encoding: 'utf8', mode: 0o660});
}



const returnError = (error: any, res: Response, statusCode = 500, body: any = undefined ): void => {
  console.error(error);
  if (!body) {
    body = {success: false, error};
  }
  res.status(statusCode).json(body);
}



const decrypt = (str: string, encoding: NodeRSA.Encoding = 'utf8'): string => {
  return encryptor.decrypt(str, encoding);
}



const encrypt = (str: string, encoding: any = 'utf8') => {
  return encryptor.encrypt(str, encoding);
}











////////////////////// API //////////////////////

app.get(apiPath + '/whoami', (req, res) => {
  let currentUser = randomElement(users);
  res.status(200).json( currentUser );
});



app.get(apiPath + '/publicKey', (req, res) => {
  // sends the internal public key
  res.status(200).json( { publicKey: internalPubKey } );
});



app.get(apiPath + '/sampleIncident', async (req, res) => {
  let data;
  const fileName = 'testIncidentFields.json';
  const filePath = `${sampleIncidentsDir}/${fileName}`;
  try {
    // read file
    data = await fs.promises.readFile(filePath, { encoding: 'utf8' });
  }
  catch (error: any) {
    return returnError(`Error whilst parsing file ${fileName}: ${error}`, res);
  }

  try {
    // parse file contents
    const parsedData = JSON.parse(data);
    res.status(200).json(parsedData);
    return;
  }
  catch (error: any) {
    return returnError(`Caught error parsing ${filePath}: ${error}`, res);
  }

});



/// XSOAR Endpoint Calls ///

app.get(apiPath + '/demistoEndpoint', async (req, res) => {
  // return all demisto API configs to the client, minus their apiKeys
  const tmpDemistoEndpointConfigs = JSON.parse(JSON.stringify(demistoEndpointConfigs)) as DemistoEndpoints; // poor man's deep copy
  Object.values(tmpDemistoEndpointConfigs).forEach( apiConfig => {
    delete (apiConfig as any).apiKey;
  });
  res.status(200).json(tmpDemistoEndpointConfigs);
});




app.post(apiPath + '/demistoEndpoint', async (req, res) => {
    // add a new XSOAR API server config

    const body = req.body;
    const requiredFields = ['url', 'apiKey', 'trustAny'];

    try {
      utils.checkForRequiredFields(requiredFields, body);
    }
    catch(fieldName) {
      return res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing`});
    }

    const {url, apiKey, trustAny, proxy} = body;
    const id = uuidv4();

    const urlRegex = new RegExp(/^https?:\/\/\S+$/);
    const badUrlRegex = new RegExp(/^https?:\/\/\S+?\//);

    if (!urlRegex.test(url)) {
      return returnError(`Error creating XSOAR endpoint: '${url}' is not a valid URL`, res, 400);
    }
    if (badUrlRegex.test(url)) {
      return returnError(`Error creating XSOAR endpoint: '${url}' must not end with a '/' or a URI`, res, 400);
    }

    // remove any junk data
    const config: DemistoEndpoint = {
      id,
      url,
      apiKey,
      trustAny
    };

    if (proxy) {
      config.proxy = proxy;
    }

    demistoEndpointConfigs[id] = config;
    await saveApiConfig();
    res.status(201).json({success: true, id});
});



app.post(apiPath + '/demistoEndpoint/update', async (req, res) => {
    // saves XSOAR API config

    const body = req.body;
    const requiredFields = ['id', 'url', 'trustAny']; // 'apiKey' property may be omitted so that the apiKey can be fetched from existing config using 'id' property

    try {
      utils.checkForRequiredFields(requiredFields, body);
    }
    catch(fieldName) {
      return res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing`});
    }

    const {id, url, trustAny, proxy} = body;
    const apiKey = body.hasOwnProperty('apiKey') ? body.apiKey : getDemistoEndpointConfig(id).apiKey;

    const urlRegex = new RegExp(/^https?:\/\/\S+$/);
    const badUrlRegex = new RegExp(/^https?:\/\/\S+?\//);

    if (!urlRegex.test(url)) {
      return returnError(`Error creating XSOAR endpoint: '${url}' is not a valid URL`, res, 400);
    }
    if (badUrlRegex.test(url)) {
      return returnError(`Error creating XSOAR endpoint: '${url}' must not end with a '/' or a URI`, res, 400);
    }
    
    // remove any junk data
    const config: DemistoEndpoint = {
      id,
      url,
      apiKey,
      trustAny
    };

    if (proxy) {
      config.proxy = proxy;
    }

    demistoEndpointConfigs[id] = config;

    await saveApiConfig();
    res.status(200).json({success: true});
});



app.delete(apiPath + '/demistoEndpoint/:serverId', async (req, res) => {
  // deletes a XSOAR server from the API config
  const serverId = decodeURIComponent(req.params.serverId);
  if (demistoEndpointConfigs.hasOwnProperty(serverId)) {
    delete demistoEndpointConfigs[serverId];
    if (defaultDemistoEndpointId && !demistoEndpointConfigs.hasOwnProperty(defaultDemistoEndpointId)) {
      // make sure default api is still defined.  If not, unset it
      defaultDemistoEndpointId = undefined;
    }
    await saveApiConfig();
    res.status(200).json({success: true});
  }
  else {
    return returnError(`XSOAR server '${serverId}' was not found`, res);
  }
});



app.post(apiPath + '/demistoEndpoint/test/adhoc', async (req, res) => {
  // Tests for good connectivity to Demisto server by fetching user settings.
  // Does not save settings.  Another call will handle that.

  const requiredFields = ['url', 'trustAny'];
  const body = req.body;
  // console.log('body:', body);

  try {
    utils.checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    const error = `Invalid request: Required field '${fieldName}' was missing`;
    return returnError(error, res, 400);
  }

  // check for client body fields
  if (!('apiKey' in body || 'id' in body)) {
    const error = `Invalid request: One of required fields 'apiKey' or 'id' was missing`;
    return returnError(error, res, 400);
  }

  const {url, trustAny, proxy} = body;
  const apiKey = body.hasOwnProperty('id') ? getDemistoEndpointConfig(body.id).apiKey : body.apiKey;

  let testResult;
  try {
    testResult = await testApi(url, decrypt(apiKey), trustAny, proxy);
    // console.debug('testResult:', testResult);
  }
  catch(error: any) {
    return returnError(`Error testing XSOAR URL: ${url}: ${error}`, res);
  }

  if (!testResult.success) {
    const error = testResult.error;
    const statusCode = 'statusCode' in testResult ? testResult.statusCode : undefined;
    // console.error('error:', error);

    // since this is a test, we don't want to return a 500 if it fails.  Status code should be normal
    if (error && statusCode) {
      console.info(`XSOAR server test failed with code ${statusCode}:`, error);
      return res.status(200).json({ success: false, statusCode, error });
    }
    else if (error && !statusCode) {
      console.info(`XSOAR server test failed:`, error);
      return res.status(200).json({ success: false, error });
    }
    else {
      console.info('XSOAR server test failed.  Unspecified error');
      return res.status(200).json({ success: false, error: 'unspecified' });
    }
  }

  console.log(`Logged into XSOAR as user '${testResult.result.body.username}'`);
  console.log(`Successfully tested XSOAR URL '${url}'`);
  return res.status(200).json( { success: true, statusCode: 200 } );
});



app.get(apiPath + '/demistoEndpoint/test/:serverId', async (req, res) => {
  // Tests for good connectivity to XSOAR server by fetching user settings.
  // Does not save settings.  Another call will handle that.

  const serverId = decodeURIComponent(req.params.serverId);
  const {url, apiKey, trustAny, proxy} = getDemistoEndpointConfig(serverId);
  let testResult;

  try {
    testResult = await testApi(url, decrypt(apiKey), trustAny, proxy);
  }
  catch(error: any) {
    return returnError(`Error testing XSOAR URL: ${url}: ${error}`, res);
  }

  // console.debug('testResult:', testResult);
  if (!testResult.success) {
    const error = testResult.error;
    const statusCode = 'statusCode' in testResult ? testResult.statusCode : undefined;
    // console.error('error:', error);

    // since this is a test, we don't want to return a 500 if it fails.  Status code should be normal
    if (error && statusCode) {
      console.info(`XSOAR server test failed with code ${statusCode}:`, error);
      res.status(200).json({ success: false, statusCode, error });
    }
    else if (error && !statusCode) {
      console.info(`XSOAR server test failed:`, error);
      res.status(200).json({ success: false, error });
    }
    else {
      console.info('XSOAR server test failed.  Unspecified error');
      res.status(200).json({ success: false, error: 'unspecified' });
    }
    return;
  }

  console.log(`Logged into XSOAR as user '${testResult.result.body.username}'`);
  console.log(`Successfully tested XSOAR URL '${url}'`);
  return res.status(200).json( { success: true, statusCode: 200 } );
  
});



app.post(apiPath + '/demistoEndpoint/default', async (req, res) => {
  // sets the default XSOAR API endpoint
  let serverId;

  try {
    serverId = req.body.serverId;
  }
  catch(err) {
    return returnError(`serverId not found in request body`, res);
  }

  if (demistoEndpointConfigs.hasOwnProperty(serverId)) {
    defaultDemistoEndpointId = serverId;
    res.status(200).json({success: true});
    await saveApiConfig();
  }
  else {
    return returnError(`${serverId} is not a known XSOAR API endpoint`, res);
  }
});



app.get(apiPath + '/demistoEndpoint/default', async (req, res) => {
  // fetch the default XSOAR API endpoint
  if (defaultDemistoEndpointId) {
    res.status(200).json({defined: true, serverId: defaultDemistoEndpointId});
  }
  else {
    res.status(200).json({defined: false});
  }
});



app.get(apiPath + '/incidentFields/:serverId', async (req, res) => {
  // Retrieves incident fields from XSOAR
  const serverId = decodeURIComponent(req.params.serverId);
  const fields = await fetchIncidentFields(serverId) || [];
  if (fields) {
    incident_fields[serverId] = fields;
  }
  res.status(200).json( {id: serverId, incident_fields: fields} );
} );



app.get(apiPath + '/incidentType/:serverId', async (req, res) => {
  // Retrieves the list of incident types from XSOAR
  const serverId = decodeURIComponent(req.params.serverId);
  const incident_types = await getIncidentTypes(serverId);
  res.status(200).json( {id: serverId, incident_types} );
} );



app.post(apiPath + '/createDemistoIncident', async (req, res) => {
  // This method will create an XSOAR incident, per the body supplied by the client

  const currentUser = req.headers.authorization;

  const body = req.body;
  let demistoServerConfig;
  let serverId;
  try {
    serverId = body.serverId;
    demistoServerConfig = getDemistoEndpointConfig(serverId);
  }
  catch (error: any) {
    return returnError(`'serverId' field not present in body`, res, 500, { success: false, statusCode: 500, error });
  }

  // console.debug(body);

  const options: AxiosRequestConfig = {
    url: demistoServerConfig.url + '/incident',
    method: 'POST',
    headers: {
      Authorization: decrypt(demistoServerConfig.apiKey),
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    httpsAgent: utils.getAxiosHTTPSAgent(demistoServerConfig.trustAny),
    data: body
  };
  
  let result;
  try {
    // send request to XSOAR
    result = await Axios(options);
  }
  catch (error: any) {
    if ( error && 'response' in error && error.response && 'statusCode' in error.response && error.statusCode !== null) {
      return returnError(
        `Caught error opening XSOAR incident: code ${error.response.status}: ${error.response.statusMessage}`,
        res,
        500,
        {
          success: false,
          statusCode: error.statusCode,
          statusMessage: error.response.statusMessage
        }
      );
    }
    else if (error && 'message' in error) {
      return returnError(
        `Caught error opening XSOAR incident: ${error.message}`,
        res,
        502,
        {
          success: false,
          statusCode: null,
          error: error.message
        }
      );
    }
    else {
      return returnError(
        `Caught unspecified error opening XSOAR incident: ${error}`,
        res,
        500,
        {
          success: false,
          statusCode: 500,
          error: 'unspecified'
        }
      );
    }
  }

  const incidentId = result.data.id;
  // send results to client
  res.status(201).json( { id: incidentId, success: true, statusCode: result.status, statusMessage: result.statusText } );
  // console.debug(result);
  console.log(`User ${currentUser} created XSOAR incident with id ${incidentId}`);
} );



app.post(apiPath + '/createDemistoIncidentFromJson', async (req, res) => {
  // This method will create an XSOAR incident, per the json property supplied by the client in the body

  const currentUser = req.headers.authorization;
  const body = req.body;

  const requiredFields = ['serverId', 'json'];
  try {
    utils.checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing`});
    return;
  }
  
  const json = body.json;
  let demistoServerConfig;
  let serverId;
  try {
    serverId = body.serverId;
    demistoServerConfig = getDemistoEndpointConfig(serverId);
  }
  catch(error: any) {
    return returnError('message' in error ? error.message : error, res, 500, { success: false, statusCode: 500, error });
  }

  // console.debug(body);

  let options: AxiosRequestConfig = {
    url: demistoServerConfig.url + '/incident/json',
    method: 'POST',
    headers: {
      Authorization: decrypt(demistoServerConfig.apiKey),
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    // rejectUnauthorized: !demistoServerConfig.trustAny,
    httpsAgent: utils.getAxiosHTTPSAgent(demistoServerConfig.trustAny),
    data: json
  };
  
  let result;
  try {
    // send request to XSOAR
    // result = await request( addHttpProxy(options, serverId) );
    result = await Axios( addHttpProxy(options, serverId) );
    // console.log('result:', result);
  }
  catch (error: any) {
    if ( error && 'response' in error && error.response && 'statusCode' in error.response && error.statusCode !== null) {
      return returnError(`Caught error opening XSOAR incident: code ${error.response.status}: ${error.response.statusMessage}`, res, 500, { success: false, statusCode: error.statusCode, statusMessage: error.response.statusMessage });
    }
    else if (error && 'message' in error) {
      return returnError(`Caught error opening XSOAR incident: ${error.message}`, res, 500, { success: false, statusCode: null, error: error.message });
    }
    else {
      return returnError(`Caught unspecified error opening XSOAR incident: ${error}`, res, 500, { success: false, statusCode: 500, error: 'unspecified' });
    }
    return;
  }

  // console.log('result body:', result.body);

  if (result.data) {
    const incidentId = result.data.id;
    // send results to client
    // console.debug(res);
    console.log(`User ${currentUser} created XSOAR incident with id ${incidentId}`);
    res.status(201).json( {
      id: incidentId,
      success: true,
      statusCode: result.status,
      statusMessage: result.statusText
    } );
  }

  else {
    // this can happen if an incident didn't get created, possibly due to preprocessing rules
    const error = `XSOAR did not create an incident based off of the request.  It could be caused by pre-processing rules dropping the incident`
    res.status(200).json( {
      success: false,
      statusCode: result.status,
      statusMessage: error
    } );
  }

} );



app.post(apiPath + '/createInvestigation', async (req, res) => {
  // creates a demisto investigation (as opposed to an incident)

  const body = req.body;
  const requiredFields = ['incidentId', 'version'];

  try {
    utils.checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing`});
    return;
  }

  // get version
  const {incidentId, version} = body;

  let demistoServerConfig;
  let serverId;
  try {
    serverId = req.body.serverId;
    demistoServerConfig = getDemistoEndpointConfig(serverId);
  }
  catch (error: any) {
    return returnError(`'serverId' field not present in body`, res, 500, { success: false, statusCode: 500, error });
  }

  const requestBody = {
    id: `${incidentId}`,
    version
  };

  const options: AxiosRequestConfig = {
    url: demistoServerConfig.url + '/incident/investigate',
    method: 'POST',
    headers: {
      Authorization: decrypt(demistoServerConfig.apiKey),
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    // rejectUnauthorized: !demistoServerConfig.trustAny,
    httpsAgent: utils.getAxiosHTTPSAgent(demistoServerConfig.trustAny),
    data: requestBody
  };
  
  let result;
  try {
    // send request to XSOAR
    // result = await request( addHttpProxy(options, serverId) );
    result = await Axios( addHttpProxy(options, serverId) );
    res.status(201).json({success: true});
  }
  catch (error: any) {
    if ('error' in error && error.error.error.startsWith('Investigation already exists for incident')) {
      return res.status(200).json({success: true});
    }
    console.error('Error sending request to XSOAR:', 'error' in error ? error.error : error.message);
    res.status(200).json( {
      success: false,
      error: 'message' in error ? error.message : error.error});
  }
} );



app.post(apiPath + '/demistoIncidentImport', async (req, res) => {
  // imports an incident from XSOAR
  try {
    const incidentId = `${req.body.incidentId}`; // coerce id into a string

    let demistoServerConfig;
    let serverId;
    try {
      serverId = req.body.serverId;
      demistoServerConfig = getDemistoEndpointConfig(serverId);
    }
    catch (error: any) {
      return returnError(`'serverId' field not present in body`, res, 500, { success: false, statusCode: 500, error });
    }

    const body = {
      "userFilter": false,
      "filter": {
        "page": 0,
        "size": 1,
        "query": `id:${incidentId}`
      }
    };

    let result;
    let options: AxiosRequestConfig = {
      url: demistoServerConfig.url + '/incidents/search',
      method: 'POST',
      headers: {
        Authorization: decrypt(demistoServerConfig.apiKey),
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      // rejectUnauthorized: !demistoServerConfig.trustAny,
      httpsAgent: utils.getAxiosHTTPSAgent(demistoServerConfig.trustAny),
      // resolveWithFullResponse: true,
      // json: true,
      data: body
    };

    // send request to XSOAR
    // result = await request( addHttpProxy(options, serverId) );
    result = await Axios( addHttpProxy(options, serverId) );

    if ('data' in result && 'total' in result.data && result.data.total === 0) {
      return res.status(200).json({
        success: false,
        error: `Query returned 0 results`
      });
    }
    else {
      return res.status(200).json({
        success: true,
        incident: result.data.data[0]
      });
    }
    // console.log('result:', result.body);
  }
  catch (error: any) {
    if ('message' in error) {
      return res.status(200).json({success: false, error: error.message});
    }
    return res.status(200).json({success: false, error: error});
  }
} );

/// END XSOAR Endpoint Calls ///



/// Freeform JSON ///

app.post(apiPath + '/json', async (req, res) => {
  // save new freeform JSON
  const body = req.body;
  const requiredFields = ['name', 'json'];

  try {
    utils.checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    return res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing`});
  }

  const {name, json} = body;
  const id = uuidv4();

  // check for existing json name
  if (freeJsonConfig.hasOwnProperty(name)) {
    const error = `Invalid request: Name '${name}' is already defined`;
    return res.status(400).json({error});
  }

  const entry = {
    id,
    name,
    json
  };

  freeJsonConfig[id] = entry;
  await saveFreeJsonConfig();

  res.status(201).json({success: true, id}); // send 'created'
} );



app.post(apiPath + '/json/update', async (req, res) => {
  // save updated freeform JSON
  const body = req.body;
  const requiredFields = ['id', 'name', 'json'];

  try {
    utils.checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    return res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing`});
  }

  const {id, name, json} = body;

  // check for existing json name
  if (!freeJsonConfig.hasOwnProperty(id)) {
    const error = `Invalid request: Id '${id}' is not defined`;
    res.status(400).json({error});
    return;
  }

  const entry = {
    id,
    name,
    json
  };

  freeJsonConfig[id] = entry;
  await saveFreeJsonConfig();

  res.status(200).json({success: true}); // send 'created'
} );



app.delete(apiPath + '/json/:id', async (req, res) => {
  // delete a freeform JSON config
  const id = req.params.id;
  let saveGroups = false;
  let saveIncidentConfigs = false;
  if (freeJsonConfig.hasOwnProperty(id)) {
    delete freeJsonConfig[id];
    
    for (const jsonGroup of Object.values(jsonGroupsConfig)) {
      // remove deleted JSON from groups
      for (let i = jsonGroup.jsonFileIds.length - 1; i >= 0; i--) {
        const jsonConfigId = jsonGroup.jsonFileIds[i];
        if (jsonConfigId === id) {
          jsonGroup.jsonFileIds.splice(i, 1);
          saveGroups = true;
        }
      }
    }

    for (const incidentConfig of Object.values(incidentsConfig)) {
      // remove deleted JSON as default file for incident configs
      if (incidentConfig.hasOwnProperty('defaultJsonId') && incidentConfig.defaultJsonId === id) {
        delete incidentConfig.defaultJsonId;
        saveIncidentConfigs = true;
      }
    }

    await saveFreeJsonConfig();
    if (saveGroups) {
      await saveJsonGroupsConfig();
    }
    if (saveIncidentConfigs) {
      await saveIncidentsConfig();
    }
    res.status(200).json({id, success: true});
    return;
  }
  else {
    const error = `JSON file with id '${id}' not found`;
    res.status(400).json({error, id, success: false});
    return;
  }
} );



app.get(apiPath + '/json/all', async (req, res) => {
  // retrieve all freeform JSON config names
  const freeJsonNames = Object.values(freeJsonConfig).map( config => ({ id: config.id, name: config.name}) );
  res.status(200).json(freeJsonNames);
} );



app.get(apiPath + '/json/:id', async (req, res) => {
  // get a particular freeform JSON config
  const id = req.params.id;
  if (freeJsonConfig.hasOwnProperty(id)) {
    const jsonConfig = freeJsonConfig[id];
    res.status(200).json(jsonConfig);
    return;
  }
  else {
    const error = `Freeform JSON config ${'name'} was not found`;
    return returnError(error, res, 400);
  }
} );

/// END Freeform JSON ///



/// Incident Configs ///

app.post(apiPath + '/incidentConfig', async (req, res) => {
  // save a new incident config
  const body = req.body;
  const requiredFields = ['name', 'chosenFields', 'createInvestigation', 'incidentType'];

  try {
    utils.checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing`});
    return;
  }

  const {name, chosenFields, createInvestigation, incidentType} = body;
  const id = uuidv4();

  // check for existing config name
  const incidentNames = Object.values(incidentsConfig).map( config => config.name);
  if (incidentNames.includes(name)) {
    const error = `Invalid request: Name '${name}' is already defined`;
    res.status(400).json({error});
    return;
  }

  // remove any invalid fields
  const entry: IncidentConfig = {
    name,
    id,
    incidentType,
    chosenFields,
    createInvestigation
  };

  if (body.hasOwnProperty('defaultJsonId')) {
    entry.defaultJsonId = body.defaultJsonId;
  }

  if (body.hasOwnProperty('defaultJsonGroupId')) {
    entry.defaultJsonGroupId = body.defaultJsonGroupId;
  }

  incidentsConfig[id] = entry;
  await saveIncidentsConfig();

  res.status(201).json({success: true, id}); // send 'created'
} );



app.post(apiPath + '/incidentConfig/update', async (req, res) => {
  // update an existing incident config
  const body = req.body;
  const requiredFields = ['id', 'name', 'chosenFields', 'createInvestigation', 'incidentType'];

  try {
    utils.checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    return res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing from request body`});
  }

  const {id, name} = body;

  // remove any invalid fields
  const updatedIncidentConfig: IncidentConfig = {
    name,
    id,
    incidentType: body.incidentType,
    chosenFields: body.chosenFields,
    createInvestigation: body.createInvestigation
  };

  if (body.hasOwnProperty('defaultJsonId')) {
    updatedIncidentConfig.defaultJsonId = body.defaultJsonId;
  }

  if (body.hasOwnProperty('defaultJsonGroupId')) {
    updatedIncidentConfig.defaultJsonGroupId = body.defaultJsonGroupId;
  }

  for (const config of Object.values(incidentsConfig)) {
    if (config.name === name && config.id !== id) {
      const error = `Incident config update failed with bad request: another config with name '${name}' already exists`;
      console.info(error);
      return res.status(400).json({error});
    }
  }

  incidentsConfig[id] = updatedIncidentConfig;

  await saveIncidentsConfig();

  res.status(200).json({success: true}); // send 'OK'
} );



app.post(apiPath + '/incidentConfig/defaultJson', async (req, res) => {
  // update an existing incident config's default JSON file
  const body = req.body;
  const requiredFields = ['incidentConfigId', 'jsonId'];

  try {
    utils.checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    const error = `Invalid request: Required field '${fieldName}' was missing`;
    return returnError(error, res, 400);
  }

  const {incidentConfigId, jsonId} = body; // set jsonId to null to clear default

  if (!incidentsConfig.hasOwnProperty(incidentConfigId)) {
    return res.status(400).json({error: `Incident config id ${incidentConfigId} is not defined`});
  }

  if (jsonId !== null && !(freeJsonConfig.hasOwnProperty(jsonId))) {
    return res.status(400).json({error: `JSON config ${jsonId} is not defined`});
  }

  const incidentConfig = incidentsConfig[incidentConfigId];
  if (jsonId === null && incidentConfig.hasOwnProperty('defaultJsonId')) {
    delete incidentConfig['defaultJsonId'];
    console.log(`Cleared default JSON config for incident config ${incidentConfig.name}`);
  }
  else if (jsonId !== null) {
    incidentConfig['defaultJsonId'] = jsonId;
    console.log(`Set default JSON config to ${jsonId} for incident config ${incidentConfig.name}`);
  }

  await saveIncidentsConfig();

  res.status(200).json({success: true});; // send 'OK'
} );



app.post(apiPath + '/incidentConfig/defaultJsonGroup', async (req, res) => {
  // update an existing incident config's default JSON Group
  const body = req.body;
  const requiredFields = ['incidentConfigId', 'jsonGroupId'];

  try {
    utils.checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    const error = `Invalid request: Required field '${fieldName}' was missing`;
    return returnError(error, res, 400);
  }

  const {incidentConfigId, jsonGroupId} = body; // set jsonId to null to clear default

  if (!incidentsConfig.hasOwnProperty(incidentConfigId)) {
    return res.status(400).json({error: `Incident config id ${incidentConfigId} is not defined`});
  }

  if (jsonGroupId !== null && !(jsonGroupsConfig.hasOwnProperty(jsonGroupId))) {
    return res.status(400).json({error: `JSON Group config ${jsonGroupId} is not defined`});
  }

  const incidentConfig = incidentsConfig[incidentConfigId];
  if (jsonGroupId === null && incidentConfig.hasOwnProperty('defaultJsonGroupId')) {
    delete incidentConfig['defaultJsonGroupId'];
    console.log(`Cleared default JSON Group config for incident config ${incidentConfig.name}`);
  }
  else if (jsonGroupId !== null) {
    incidentConfig['defaultJsonGroupId'] = jsonGroupId;
    console.log(`Set default JSON Group config to ${jsonGroupId} for incident config ${incidentConfig.name}`);
  }

  await saveIncidentsConfig();

  res.status(200).json({success: true});; // send 'OK'
} );



app.get(apiPath + '/incidentConfig/all', async (req, res) => {
  // retrieve all incident configs -- must come before /incidentConfig/:name
  res.status(200).json(incidentsConfig);
} );



app.get(apiPath + '/incidentConfig/:id', async (req, res) => {
  // fetch a particular incident config
  const id = req.params.id;
  if (incidentsConfig.hasOwnProperty(id)) {
    res.status(200).json(incidentsConfig[id]);
    return;
  }
  else {
    const error = `A config with id ${id} was not found`;
    res.status(400).json({error});
    return;
  }
} );



app.delete(apiPath + '/incidentConfig/:id', async (req, res) => {
  // delete an incident config
  const id = req.params.id;
  if (incidentsConfig.hasOwnProperty(id)) {
      delete incidentsConfig[id];
      await saveIncidentsConfig();
      res.status(200).json({id, success: true});
      return;
    }
    else {
      const error = `A config with id ${id} was not found`;
      res.status(400).json({error, id, success: false});
      return;
    }
} );

/// END Incident Configs ///



/// JSON Groups ///

app.post(apiPath + '/jsonGroup', async (req, res) => {
  // save a new JSON group config
  const body = req.body;
  const requiredFields = ['name', 'jsonFileIds'];

  try {
    utils.checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    return res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing`});
  }

  const id = uuidv4();
  const {name, jsonFileIds} = body;

  try {
    utils.validateJsonGroup(jsonFileIds);
  }
  catch(error: any) {
    return res.status(400).json({error: `Invalid request: ${error}`});
  }

  // check for existing config name
  let foundName = false;
  for (const config of Object.values(jsonGroupsConfig)) {
    if (config.name === name) {
      foundName = true;
      break;
    }
  }
  if (foundName) {
    const error = `Invalid request: a JSON Group named '${name}' is already defined`;
    return res.status(400).json({error});
  }

  const newJsonGroup = {
    id,
    name,
    jsonFileIds
  }

  jsonGroupsConfig[id] = newJsonGroup;
  await saveJsonGroupsConfig();

  res.status(201).json({success: true, id}); // send 'created'
} );



app.post(apiPath + '/jsonGroup/update', async (req, res) => {
  // update an existing JSON group config
  const body = req.body;
  const requiredFields = ['id', 'name', 'jsonFileIds'];

  try {
    utils.checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    return res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing`});
  }

  const {id, name, jsonFileIds} = body;

  try {
    utils.validateJsonGroup(jsonFileIds);
  }
  catch(error: any) {
    res.status(400).json({error: `Invalid request: ${error}`});
    return;
  }

  // check for existing config id
  if (!jsonGroupsConfig.hasOwnProperty(id)) {
    const error = `Invalid request: no JSON Group with id '${id}' exists`;
    return res.status(400).json({error});
  }

  const newJsonGroup = {
    id,
    name,
    jsonFileIds
  }

  jsonGroupsConfig[id] = newJsonGroup;
  await saveJsonGroupsConfig();

  res.status(200).json({success: true}); // send 'OK'
} );



app.get(apiPath + '/jsonGroup/all', async (req, res) => {
  // retrieve all JSON Group configs
  res.status(200).json(jsonGroupsConfig);
} );



app.delete(apiPath + '/jsonGroup/:id', async (req, res) => {
  // delete a JSON Group config
  const id = req.params.id;
  let saveIncidentConfigs = false;
  if (jsonGroupsConfig.hasOwnProperty(id)) {
    delete jsonGroupsConfig[id];
    await saveJsonGroupsConfig();
    
    for (const incidentConfig of Object.values(incidentsConfig)) {
      // remove deleted JSON group as default group for incident configs
      if (incidentConfig.hasOwnProperty('defaultJsonGroupId') && incidentConfig.defaultJsonGroupId === id) {
        delete incidentConfig.defaultJsonGroupId;
        saveIncidentConfigs = true;
      }
    }

    if (saveIncidentConfigs) {
      await saveIncidentsConfig();
    }

    return res.status(200).json({id, success: true});
  }
  else {
    const error = `JSON Group with id '${id}' was not found`;
    return res.status(400).json({error, name, success: false});
  }
} );

/// END JSON Groups ///



/// File Attachments ///

app.get(apiPath + '/attachment/all', async (req, res) => {
  // retrieve all file attachment configs
  res.status(200).json(attachmentsConfig);
} );



app.get(apiPath + '/attachment/:id', async (req, res) => {
  // Send a file attachment file back to client
  const id = req.params.id;
  if (!attachmentsConfig.hasOwnProperty(id)) {
    return res.status(404).send('File attachment not found');
  }
  const attachmentConfig = attachmentsConfig[id];
  const filename = attachmentConfig.filename;
  const diskfilename = `${attachmentsDir}/${id}`;
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  res.type('application/octet-stream'); // just make it a generic download
  res.download(diskfilename, filename);
} );



app.post(apiPath + '/attachment', multipartUploadHandler.single('attachment'), async (req, res) => {
  // Upload a new file attachment
  const id = uuidv4();

  const body = req.body;
  /*const requiredFields = ['name'];

  try {
    utils.checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing`});
    return;
  }*/

  const fileObject = req.file;
  // console.log('fileObject:', fileObject);

  if (!fileObject) {
    return res.status(400).send('Bad Request');
  }

  const multerPath = fileObject.path;
  const filename = fileObject.originalname;
  const comment = 'comment' in body ? body.comment : '';
  const diskfilename = `${id}`;
  const size = fileObject.size;
  const mediaFile = body.mediaFile === 'true' ? true : false;

  const { stdout, stderr } = await exec(`file -bi ${multerPath}`);
  let detectedType;
  if (stdout) {
    detectedType = stdout.trim();
  }

  // console.log('detectedType:', detectedType);

  // check for existing id (should never collide, but just in case)
  if (attachmentsConfig.hasOwnProperty(id)) {
    const error = `Invalid request: Attachment ID '${id}' is already defined`;
    fs.promises.unlink(multerPath); // delete file
    return res.status(409).json({error});
  }

  try {
    await mv(multerPath, `${attachmentsDir}/${diskfilename}`);

    const attachmentConfig: FileAttachmentConfig = {
      id,
      filename,
      size,
      detectedType,
      mediaFile,
      comment
    }

    // console.log('attachmentConfig:', attachmentConfig);

    attachmentsConfig[id] = attachmentConfig;

    saveAttachmentsConfig();

    return res.status(201).json({success: true, id}); // send 'created';
  }

  catch (error: any) {
    console.error('Caught error saving file attachment:', error);
    return res.status(500).json({error});
  }

} );



app.delete(apiPath + '/attachment/:id', async (req, res) => {
  // delete an attachment config
  const id = req.params.id;
  if (id in attachmentsConfig) {
    const filename = `${id}`;
    await deleteFileAttachment(filename);
    delete attachmentsConfig[id];
    await saveAttachmentsConfig();
    await removeAttachmentFromIncidents(id); 
    return res.status(200).json({id, success: true});
  }
  else {
    const error = `Attachment ID '${id}' not found`;
    return res.status(400).json({error, id, success: false});
  }
} );



app.post(apiPath + '/attachment/update', async (req, res) => {
  // update an existing attachment config

  const body = req.body;

  const requiredFields = ['id', 'filename'];
  try {
    utils.checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing`});
    return;
  }

  const id = body.id;

  if (!(id in attachmentsConfig)) {
    const error = `Attachment ID '${id}' not found`;
    return res.status(400).json({error, id, success: false});
  }

  const oldConfig = attachmentsConfig[id];

  const newConfig = body;

  const validFields = requiredFields.concat(['comment', 'mediaFile']);

  const sanitisedConfig = utils.sanitiseObjectFromValidKeyList(validFields, newConfig);

  sanitisedConfig.size = oldConfig.size;
  sanitisedConfig.detectedType = oldConfig.detectedType;

  // console.log('sanitisedConfig:', sanitisedConfig);

  attachmentsConfig[id] = sanitisedConfig;
  await saveAttachmentsConfig();
  return res.status(200).json({id, success: true});
} );



app.post(apiPath + '/attachment/push', async (req, res) => {
  // Push a file attachment to XSOAR
  const body = req.body;

  const requiredFields = ['attachmentId', 'incidentFieldName', 'serverId', 'filename', 'last'];
  try {
    utils.checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing`});
    return;
  }

  const attachment = body;

  if (!(attachment.attachmentId in attachmentsConfig)) {
    const error = 'Attachment ID not found';
    console.error(error);
    return returnError(error, res);
  }

  let result;

  try {
    const mediaFile = 'mediaFile' in attachment ? attachment.mediaFile : undefined;
    const comment = 'comment' in attachment ? attachment.comment : undefined;

    result = await uploadAttachmentToDemisto(attachment.serverId, attachment.incidentId, attachment.incidentFieldName, attachment.attachmentId, attachment.filename, attachment.last, mediaFile, comment);
    return res.status(201).json({success: true, version: result.data.version});
  }
  catch (error: any) {
    console.error(error);
    return res.status(200).json({success: false, error});
  }
  

});

/// END File Attachments ///





///// STARTUP UTILITY FUNCTIONS /////

function loadIncidentCreatorSettings (configDir: string, settingsFile: string): AppSettings {
  console.log('loadIncidentCreatorSettings()');
  const tmpSettings: any = {};
  const foundConfigDir =  fs.existsSync(configDir);
  
  if (!foundConfigDir) {
    console.log(`Config dir '${configDir}' was not found.  This probably means we're running in developmnent mode.  Creating it.`);
    fs.mkdirSync(configDir);
  }
  
  const foundSettingsFile =  fs.existsSync(`${configDir}/${settingsFile}`);
  if (!foundSettingsFile) {
    // Did not find the app configuration file.  Write default settings to the app settings file
    console.log('No settings file was found.  Loading and writing defaults');
    fs.writeFileSync(settingsFile, JSON.stringify(DefaultSettings, null, 2), { encoding: 'utf8', mode: 0o660});
  }

  try {
    const loadedSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    for (const key of Object.keys(DefaultSettings as AppSettings)) {
      tmpSettings[key] = loadedSettings.hasOwnProperty(key) ? loadedSettings[key] : DefaultSettings[key as keyof AppSettings];
    }
  }
  catch (error: any) {
    for (const key of Object.keys(DefaultSettings)) {
      const value = DefaultSettings[key as keyof AppSettings];
      tmpSettings[key] = value;
    }
  }

  return tmpSettings as AppSettings;
}



const loadDemistoEndpointConfigs = async (): Promise<DemistoEndpoints> => {
  console.log('loadDemistoEndpointConfigs()');
  // Read XSOAR API configs
  let tmpDemistoEndpointConfigs: DemistoEndpoints = {};
  const foundDemistoApiConfig = fs.existsSync(apiCfgFile); // check for presence of API configuration file
  if (!foundDemistoApiConfig) {
    console.log('No XSOAR API configuration file was found');
  }
  else {
    const loadedConfig = JSON.parse(fs.readFileSync(apiCfgFile, 'utf8')) as SavedDemistoEndpoint;
    // console.log('loadedConfig:', utils.prettyJsonStringify(loadedConfig));
    const schema = loadedConfig.schema;
    // console.log(parsedApiConfig);
    const endpointConfig = loadedConfig.endpointConfig;

    for (const apiConfig of endpointConfig.servers) {
      if (apiConfig.id) {
        tmpDemistoEndpointConfigs[apiConfig.id] = apiConfig;
      }
    }

    // console.log('tmpDemistoEndpointConfigs:', utils.prettyJsonStringify(tmpDemistoEndpointConfigs));

    // identify the default demisto api config
    let demistoServerConfig: DemistoEndpoint | undefined;
    if (endpointConfig.default !== undefined) {
      defaultDemistoEndpointId = endpointConfig.default;
      demistoServerConfig = tmpDemistoEndpointConfigs[defaultDemistoEndpointId];
      if (demistoServerConfig) {
        // console.log('demistoServerConfig:', demistoServerConfig);
        console.log(`The default API URL is '${demistoServerConfig.url}'`);
      }
    }

    if (demistoServerConfig && demistoServerConfig.hasOwnProperty('url') && demistoServerConfig.hasOwnProperty('apiKey') && demistoServerConfig.hasOwnProperty('trustAny')) {
      console.log('Testing default XSOAR API server API communication');

      // test API communication
      let testResult;
      const {url, apiKey, trustAny, proxy} = demistoServerConfig;
      try {
        testResult = await testApi(url, decrypt(apiKey), trustAny, proxy);
      }
      catch (error: any) {
        if ('message' in error && error.message.startsWith('Error during decryption')) {
          console.log(`Decryption failed.  This probably means you installed new certificates.  Please delete ${apiCfgFile} and try again.`)
        }
        else {
          console.log(error.message);
        }
        process.exit(1);
      }

      if (!defaultDemistoEndpointId) {
        return {};
      }

      if (testResult.success) {
        console.log(`Logged into XSOAR as user '${testResult.result.body.username}'`);
        console.log('XSOAR API is initialised');

        // fetch incident fields
        if (demistoServerConfig.id) {
          incident_fields[demistoServerConfig.id] = await fetchIncidentFields(defaultDemistoEndpointId) || [];
        }
      }
      else {
        console.error(`XSOAR API initialisation failed with URL ${url} with trustAny = ${tmpDemistoEndpointConfigs[defaultDemistoEndpointId].trustAny}.`);
      }
    }
  }
  return tmpDemistoEndpointConfigs;
}



const loadIncidentsConfig = (): IncidentConfigs => {
  console.log('loadIncidentsConfig()');
  // Read Field Configs
  let tmpIncidentsConfig: IncidentConfigs = {};
  const foundIncidentsFile = fs.existsSync(incidentsFile);
  if (!foundIncidentsFile) {
    console.log(`Incidents configuration file ${incidentsFile} was not found`);
  }
  else {
    try {
      const loadedIncidentsConfig = JSON.parse(fs.readFileSync(incidentsFile, 'utf8'));
      const schema = loadedIncidentsConfig.schema;
      for (const config of loadedIncidentsConfig.incidentConfigs) {
        tmpIncidentsConfig[config.id] = config;
      }
    }
    catch (error: any) {
      console.error(`Error parsing ${incidentsFile}:`, error);
      tmpIncidentsConfig = {};
    }
  }
  tmpIncidentsConfig = utils.calculateRequiresJson(tmpIncidentsConfig);
  return tmpIncidentsConfig;
}



const loadFreeJsonConfig = (): Record<any, any> => {
  console.log('loadFreeJsonConfig()');
  // Read Freeform JSON Configs
  let freeJsonConfig: Record<any, any> = {};

  const foundFreeJsonFile = fs.existsSync(freeJsonFile);
  if (!foundFreeJsonFile) {
    console.log(`Freeform JSON configuration file ${freeJsonFile} was not found`);
    freeJsonConfig = {};
  }
  else {
    try {
      const loadedConfig = JSON.parse(fs.readFileSync(freeJsonFile, 'utf8'));
      const schema = loadedConfig.schema;
      for (const config of loadedConfig.jsonConfigs) {
        freeJsonConfig[config.id] = config;
      }
    }
    catch (error: any) {
      console.error(`Error parsing ${freeJsonFile}:`, error);
      freeJsonConfig = {};
    }
  }
  return freeJsonConfig;
}




const loadJsonGroupsConfig = (): JsonGroups => {
  console.log('loadJsonGroupsConfig()');
  // Read JSON Config Groups
  const tmpJsonGroupsConfig: JsonGroups = {};
  const foundJsonGroupsFile = fs.existsSync(jsonGroupsFile);
  if (!foundJsonGroupsFile) {
    console.log(`JSON Groups configuration file ${jsonGroupsFile} was not found`);
  }
  else {
    try {
      const loadedConfig = JSON.parse(fs.readFileSync(jsonGroupsFile, 'utf8'));
      const schema = loadedConfig.schema;
      for (const config of loadedConfig.jsonGroups) {
        tmpJsonGroupsConfig[config.id] = config;
      }
      jsonGroupsConfig = tmpJsonGroupsConfig;
    }
    catch (error: any) {
      console.error(`Error parsing ${jsonGroupsFile}:`, error);
    }
  }
  return tmpJsonGroupsConfig;
}



const loadAttachmentsConfig = (): FileAttachmentConfigs => {
  console.log('loadAttachmentsConfig()');
  // Read Attachments Config
  const tmpAttachmentsConfig: FileAttachmentConfigs = {};
  const foundAttachmentsFile = fs.existsSync(attachmentsFile);
  if (!foundAttachmentsFile) {
    console.log(`File attachments configuration file ${attachmentsFile} was not found`);
  }
  else {
    try {
      const loadedConfig = JSON.parse(fs.readFileSync(attachmentsFile, 'utf8'));
      const schema = loadedConfig.schema;
      for (const config of loadedConfig.attachments) {
        tmpAttachmentsConfig[config.id] = config;
      }
    }
    catch (error: any) {
      console.error(`Error parsing ${attachmentsFile}:`, error);
    }
  }
  return tmpAttachmentsConfig;
}



const genInternalCerts = () => {
  console.log('genInternalCerts()');
  console.log('Generating internal certificate');
  const selfsigned = require('selfsigned');
  const attrs = [
    {
      name: 'commonName',
      value: os.hostname
    },
    {
      name: 'countryName',
      value: 'US'
    },
    {
      name: 'organizationName',
      value: 'Demisto'
    },
    {
      shortName: 'OU',
      value: 'Demisto'
    }
  ];
  const extensions = [
    {
      name: 'basicConstraints',
      cA: true
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true
    },
    {
      name: 'extKeyUsage',
      serverAuth: true
    }
  ];
  const options = {
    keySize: 2048,
    days: 2653,
    algorithm: 'sha256',
    extensions
  };
  const pems = selfsigned.generate(attrs, options);
  // console.log(pems);
  fs.writeFileSync(internalPubKeyFile, utils.dos2unix(pems.public), { encoding: 'utf8', mode: 0o660 });
  fs.writeFileSync(internalKeyFile, utils.dos2unix(pems.private), { encoding: 'utf8', mode: 0o660 });
}



const genSSLCerts = () => {
  console.log('genSSLCerts()');
  console.log('Generating SSL certificate');
  const selfsigned = require('selfsigned');
  const attrs = [
    {
      name: 'commonName',
      value: os.hostname
    },
    {
      name: 'countryName',
      value: 'US'
    },
    {
      name: 'organizationName',
      value: 'Demisto'
    },
    {
      shortName: 'OU',
      value: 'Demisto'
    }
  ];
  const extensions = [
    {
      name: 'basicConstraints',
      cA: true,
      critical: true
    },
    {
      name: 'keyUsage',
      critical: true,
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: false,
      keyEncipherment: false,
      dataEncipherment: false
    },
    {
      name: 'extKeyUsage',
      serverAuth: true
    },
    {
      name: 'subjectAltName',
      altNames: [
        {
          type: 2, // DNS
          value: os.hostname
        },
        {
          type: 2,
          value: 'localhost'
        }
      ]
    },
    {
      name: 'subjectKeyIdentifier'
    }
  ];
  const options = {
    keySize: 2048,
    days: 825,
    algorithm: 'sha256',
    extensions
  };
  const pems = selfsigned.generate(attrs, options);
  // console.log(pems);
  fs.writeFileSync(certFile, utils.dos2unix(pems.cert), { encoding: 'utf8', mode: 0o660 });
  fs.writeFileSync(privKeyFile, utils.dos2unix(pems.private), { encoding: 'utf8', mode: 0o660 });
}



const initSSL = async (privKeyFile: string, certFile: string): Promise<https.Server> => {
  console.log('initSSL()');

  // SSL Certs
  const privkeyExists = fs.existsSync(privKeyFile);
  const certExists = fs.existsSync(certFile);
  if (!privkeyExists && !certExists) {
    genSSLCerts()
  }
  else if (!privkeyExists) {
    console.error(`SSL private key file ${privKeyFile} not found`);
    throw new Errors.FileNotFoundError();
  }
  else if (!certExists) {
    console.error(`SSL certificate file ${certFile} not found`);
    throw new Errors.FileNotFoundError();
  }

  sslCert = fs.readFileSync(certFile, { encoding: 'utf8' });
  privKey = fs.readFileSync(privKeyFile, { encoding: 'utf8' });
  const server = https.createServer({
    key: privKey,
    cert: sslCert,
  }, app);


  // Internal Certs
  const internalKeyExists = fs.existsSync(internalKeyFile);
  const internalCertExists = fs.existsSync(internalPubKeyFile);
  if (!internalKeyExists && !internalCertExists) {
    genInternalCerts()
  }
  else if (!internalKeyExists) {
    console.error(`Internal private key file ${internalKeyFile} not found`);
    throw new Errors.FileNotFoundError();
  }
  else if (!internalCertExists) {
    console.error(`Internal certificate file ${internalPubKeyFile} not found`);
    throw new Errors.FileNotFoundError();
  }

  internalPubKey = fs.readFileSync(internalPubKeyFile, { encoding: 'utf8' });
  const internalPrivKey = fs.readFileSync(internalKeyFile, { encoding: 'utf8' });

  encryptor = new NodeRSA( internalPrivKey );
  encryptor.setOptions({encryptionScheme: 'pkcs1'});

  return server;
}



const checkAndCreateDirs = () => {
  console.log('checkAndCreateDirs()');
  if (!fs.existsSync(sslDir)){
    fs.mkdirSync(sslDir);
  }
  if (!fs.existsSync(attachmentsDir)){
    fs.mkdirSync(attachmentsDir);
  }
  if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
  }  
}



///// FINISH STARTUP //////

(async function() {
  checkAndCreateDirs();

  server = await initSSL(privKeyFile, certFile).catch( error => {
    const exitCode = 1;
    console.error(`SSL initialisation failed.  Exiting with code ${exitCode}`);
    process.exit(exitCode);
  });
  

  demistoEndpointConfigs = await loadDemistoEndpointConfigs();
  incidentsConfig = loadIncidentsConfig();
  freeJsonConfig = loadFreeJsonConfig();
  jsonGroupsConfig = loadJsonGroupsConfig();
  attachmentsConfig = loadAttachmentsConfig();

  const foundDist = fs.existsSync(staticDir); // check for presence of pre-built angular client directory

  if (foundDist && !devMode) {
    // Serve compiled Angular files statically
    console.log('Found dist/ directory.  Serving client from there');
    app.use(express.static(staticDir));
  }

  else {
    // Proxy client connections to the 'ng serve' instance
    console.log(`Enabling client development mode -- proxying Angular development server at ${appSettings.developmentProxyDestination}`);

    // var proxy = require('express-http-proxy'); // express-http-proxy supports being tied to defined express routes
    if (appSettings.developmentProxyDestination) {
      app.use('/', proxy(appSettings.developmentProxyDestination));
    }

    // proxy websockets to enable live reload - must use separate proxy lib
    var wsProxy = httpProxy.createProxyServer({ ws: true });
    server.on('upgrade', function (req, socket, head) {
      wsProxy.ws(req, socket, head, { target: appSettings.developmentProxyDestination });
    });
  }

  server.listen(appSettings.listenPort, appSettings.listenAddress, () => console.log(`Listening for client connections at https://${appSettings.listenAddress}:${appSettings.listenPort}`)); // listen for client connections
})();
