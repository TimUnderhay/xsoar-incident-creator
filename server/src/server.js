'use strict';

console.log('XSOAR Incident Creator server is starting');

////////////////////// Config and Imports //////////////////////

const os = require('os');

// Config parameters
const listenPort = 4002;
const proxyDest = 'http://localhost:4200'; // used in client development mode
const apiPath = '/api';

// XSOAR API Config
var demistoApiConfigs = {};
var defaultDemistoApiName; // the key/url of the default demistoApiConfig

// Directories and files
const fs = require('fs');
const configDir = '../etc';
const defsDir = `./definitions`;
const incidentsDir = `${configDir}/incidents`;
const staticDir = '../../dist/xsoar-incident-creator';
const foundDist = fs.existsSync(staticDir); // check for presence of pre-built angular client directory
const apiCfgFile = `${configDir}/servers.json`;
const foundDemistoApiConfig = fs.existsSync(apiCfgFile); // check for presence of API configuration file
const incidentsFile = `${configDir}/incidents.json`;
const foundIncidentsFile = fs.existsSync(incidentsFile);
const freeJsonFile = `${configDir}/json.json`;
const foundFreeJsonFile = fs.existsSync(freeJsonFile);
const jsonGroupsFile = `${configDir}/json-groups.json`;
const foundJsonGroupsFile = fs.existsSync(jsonGroupsFile);

// Certificates
const sslDir = `${configDir}/certs`;
const certFile = `${sslDir}/cert.pem`;
var sslCert;
const privKeyFile = `${sslDir}/cert.key`;
var privKey;
const internalPubKeyFile = `${sslDir}/internal.pem`;
var internalPubKey;
const internalKeyFile = `${sslDir}/internal.key`;

// encryption
var encryptor;

// UUID
const uuidv4 = require('uuid/v4');

// Incidents Config
var incidentsConfig;
var incident_fields = {};

// Freeform JSON Config
var freeJsonConfig;

// JSON Groups Config
var jsonGroupsConfig;



// Load Sample Users
const users = require(defsDir + '/users');
function randomElement(list) {
  // randomly return any array element
  let num = Math.floor(Math.random() * list.length);
  return list[num];
}

// Parse args
const devMode = process.argv.includes('--dev');

// REST client
const request = require('request-promise-native');

// Express
const express = require('express');
const app = express();
var server;
const bodyParser = require('body-parser');
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Logging
function logConnection(req, res, next) {
  // logs new client connections to the console
  let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  if (req.url.startsWith(apiPath) ) {
   console.log(`${req.method} ${req.url} from ${ip}`);
  }
  next();
}
app.use(logConnection);


////////////////////// Support Functions //////////////////////

function validateJsonGroup(jsonConfigs) {
  if (!isArray(jsonConfigs)) {
    throw `jsonConfigs is not an array`;
  }
  for (const value of jsonConfigs) {
    const valueType = typeof value;
    if (valueType !== 'string') {
      throw `jsonConfigs contains non-string values`;
    }
  }
}

function isArray(value) {
  if (typeof value === 'object' && Array.isArray(value)) {
    return true;
  }
  return false;
}



function saveFreeJsonConfig() {
  return fs.promises.writeFile(freeJsonFile, JSON.stringify(freeJsonConfig, null, 2), { encoding: 'utf8', mode: 0o660});
}



function saveJsonGroupsConfig() {
  return fs.promises.writeFile(jsonGroupsFile, JSON.stringify(jsonGroupsConfig, null, 2), { encoding: 'utf8', mode: 0o660});
}



function checkForRequiredFields(fields, body) {
  for (const fieldName of fields) {
    if (!(fieldName in body)) {
      throw `${fieldName}`;
    }
  }
}



function checkBodyForKeys(keys, body) {
  let success = true;
  for (let i = 0; i < keys.length; i++) {
    let key = keys[i];

    if (! key in body) {
      console.error(`Client body was missing key "${key}"`);
      success = false;
    }
  }
  return success;
}



function keysToLower(obj) {
  let key;
  let keys = Object.keys(obj);
  let n = keys.length;
  let newobj = {};
  while (n--) {
    key = keys[n];
    newobj[key.toLowerCase()] = obj[key];
  }
  return newobj;
}



function removeNullValues(obj) {
  let key;
  let keys = Object.keys(obj);
  let n = keys.length;
  let newobj = {};
  while (n--) {
    key = keys[n];
    if (obj[key] !== null ) {
      newobj[key.toLowerCase()] = obj[key];
    }
  }
  return newobj;
}



function removeEmptyValues(obj) {
  let key;
  let keys = Object.keys(obj);
  let n = keys.length;
  let newobj = {};
  while (n--) {
    key = keys[n];
    if (obj[key] !== '' ) {
      newobj[key.toLowerCase()] = obj[key];
    }
  }
  return newobj;
}



function saveApiConfig() {
  let config = {
    servers: demistoApiConfigs
  };
  if (defaultDemistoApiName) {
    config['default'] = defaultDemistoApiName;
  }
  return fs.promises.writeFile(apiCfgFile, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o660} );
}



async function testApi(url, apiKey, trustAny) {
  let options = {
    url: url + '/user',
    method: 'GET',
    headers: {
      Authorization: apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    rejectUnauthorized: !trustAny,
    resolveWithFullResponse: true,
    json: true,
    timeout: 2000
  }
  try {
    let result = await request( options );
    return { success: true, result }
  }
  catch(error) {
    // console.error(error);
    let res = {
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



function getDemistoApiConfig(serverId) {
  return demistoApiConfigs[serverId];
}



async function getIncidentFields(demistoUrl) {
  // This method will get incident field definitions from a XSOAR server

  let demistoServerConfig = getDemistoApiConfig(demistoUrl);

  console.log(`Fetching incident fields from '${demistoServerConfig.url}'`);

  let result;
  let options = {
    url: demistoServerConfig.url + '/incidentfields',
    method: 'GET',
    headers: {
      Authorization: decrypt(demistoServerConfig.apiKey),
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    rejectUnauthorized: !demistoServerConfig.trustAny,
    resolveWithFullResponse: true,
    json: true
  }

  try {
    // send request to XSOAR
    result = await request( options );

    // 'result' contains non-incident fields, as well, so let's make a version containing only incident fields
    let fields = result.body.reduce( (result, field) => {
      // console.log(field)
      if ('id' in field && field.id.startsWith('incident_')) {
        result.push(field)
      };
      return result;
    }, []);

    // console.log(fields);

    console.log(`Successfully fetched incident fields from '${demistoServerConfig.url}'`);
    return fields;
  }
  catch (error) {
    if ('message' in error) {
      console.error('Caught error fetching XSOAR fields configuration:', error.message);
      return;
    }
    console.error('Caught error fetching XSOAR fields configuration:', error);
  }
}



async function getIncidentTypes(demistoUrl) {
// This method will get incident type definitions from a XSOAR server

  let demistoServerConfig = getDemistoApiConfig(demistoUrl);

  console.log(`Fetching incident types from '${demistoServerConfig.url}'`);

  let result;
  let options = {
    url: demistoServerConfig.url + '/incidenttype',
    method: 'GET',
    headers: {
      Authorization: decrypt(demistoServerConfig.apiKey),
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    rejectUnauthorized: !demistoServerConfig.trustAny,
    resolveWithFullResponse: true,
    json: true
  }

  try {
    // send request to XSOAR
    result = await request( options );

    // console.log(fields);

    console.log(`Successfully fetched incident types from '${demistoServerConfig.url}'`);
    return result.body;
  }
  catch (error) {
    if ('message' in error) {
      console.error('Caught error fetching XSOAR types configuration:', error.message);
      return;
    }
    console.error('Caught error fetching XSOAR types configuration:', error);
  }
}



function saveIncidentsConfig() {
  calculateRequiresJson();
  return fs.promises.writeFile(incidentsFile, JSON.stringify(incidentsConfig, null, 2), { encoding: 'utf8', mode: 0o660});
}



function returnError(error, res, body = null, statusCode = 500 ) {
  console.error(error);
  if (!body) {
    body = {success: false, error};
  }
  res.status(statusCode).json(body);
}



function dos2unix(str) {
  return str.replace(/\r\n/g, '\n');
}



function decrypt(str, encoding = 'utf8') {
  return encryptor.decrypt(str, encoding);
}



function encrypt(str, encoding = 'utf8') {
  return encryptor.encrypt(str, encoding);
}



function calculateRequiresJson() {
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
}



////////////////////// API //////////////////////

app.get(apiPath + '/whoami', (req, res) => {
  let currentUser = randomElement(users);
  res.status(200).json( currentUser );
});



app.get(apiPath + '/publicKey', (req, res) => {
  // sends the internal public key
  res.json( { publicKey: internalPubKey } );
});



app.get(apiPath + '/sampleIncident', async (req, res) => {
  let data;
  const fileName = 'testIncidentFields.json';
  const filePath = `${incidentsDir}/${fileName}`;
  try {
    // read file
    data = await fs.promises.readFile(filePath, { encoding: 'utf8' });
  }
  catch (error) {
    return returnError(`Error whilst parsing file ${fileName}: ${error}`, res);
  }

  try {
    // parse file contents
    const parsedData = JSON.parse(data);
    res.json(parsedData);
    return;
  }
  catch (error) {
    return returnError(`Caught error parsing ${filePath}: ${error}`, res);
  }

});



/// XSOAR Endpoint Calls ///

app.post(apiPath + '/demistoEndpoint/test/adhoc', async (req, res) => {
  // Tests for good connectivity to Demisto server by fetching user settings.
  // Does not save settings.  Another call will handle that.

  // check for client body fields
  if (!('url' in req.body)) {
    return returnError(`Client did not send url`, res);
  }
  if (!('apiKey' in req.body || 'serverId' in req.body)) {
    return returnError('Client did not send apiKey or serverId', res);
  }
  if (!('trustAny' in req.body)) {
    return returnError(`Client did not send trustAny`, res);
  }

  // console.log('body:', req.body);

  let apiKey;
  const foundServerId = 'serverId' in req.body;
  if (foundServerId) {
    const serverId = req.body.serverId;
    apiKey = getDemistoApiConfig(serverId).apiKey;
  }
  else {
    apiKey = req.body.apiKey;
  }
  apiKey = decrypt(apiKey);

  // console.log('body:', req.body);

  let testResult = await testApi(req.body.url, apiKey, req.body.trustAny);
  // console.debug('testResult:', testResult);
  if (!testResult.success) {
    let error = testResult.error;
    let statusCode = null;
    if ('statusCode' in res) {
      statusCode = testResult['statusCode'];
    }
    // console.error('error:', error);

    // since this is a test, we don't want to return a 500 if it fails.  Status code should be normal
    if (error && statusCode) {
      console.info(`XSOAR server test failed with code ${statusCode}:`, error);
      res.json({ success: false, statusCode, error });
    }
    else if (error && !statusCode) {
      console.info(`XSOAR server test failed:`, error);
      res.json({ success: false, error });
    }
    else {
      console.info('XSOAR server test failed.  Unspecified error');
      res.json({ success: false, error: 'unspecified' });
    }
    return;
  }
  console.log(`Logged into XSOAR as user '${testResult.result.body.username}'`);
  res.json( { success: true, statusCode: 200 } );
  console.log(`Successfully tested URL '${req.body.url}'`);
});



app.get(apiPath + '/demistoEndpoint/test/:serverId', async (req, res) => {
  // Tests for good connectivity to XSOAR server by fetching user settings.
  // Does not save settings.  Another call will handle that.

  const serverId = decodeURIComponent(req.params.serverId);

  try {
    const apiToTest = getDemistoApiConfig(serverId);

    // console.log('body:', req.body);

    let testResult = await testApi(apiToTest.url, decrypt(apiToTest.apiKey), apiToTest.trustAny);
    // console.debug('testResult:', testResult);
    if (!testResult.success) {
      let error = testResult.error;
      let statusCode = null;
      if ('statusCode' in res) {
        statusCode = testResult['statusCode'];
      }
      // console.error('error:', error);

      // since this is a test, we don't want to return a 500 if it fails.  Status code should be normal
      if (error && statusCode) {
        console.info(`XSOAR server test failed with code ${statusCode}:`, error);
        res.json({ success: false, statusCode, error });
      }
      else if (error && !statusCode) {
        console.info(`XSOAR server test failed:`, error);
        res.json({ success: false, error });
      }
      else {
        console.info('XSOAR server test failed.  Unspecified error');
        res.json({ success: false, error: 'unspecified' });
      }
      return;
    }
    console.log(`Logged into XSOAR as user '${testResult.result.body.username}'`);
    res.json( { success: true, statusCode: 200 } );
    console.log(`Successfully tested URL '${serverId}'`);
  }
  catch(error) {
    return returnError(`Error testing ${serverId}: ${error}`, res);
  }
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

  if (serverId in demistoApiConfigs) {
    defaultDemistoApiName = serverId;
    res.status(200).json({success: true});
    await saveApiConfig();
  }
  else {
    return returnError(`${serverId} is not a known XSOAR API endpoint`, res);
  }
});



app.get(apiPath + '/demistoEndpoint/default', async (req, res) => {
  // fetch the default XSOAR API endpoint
  if (defaultDemistoApiName) {
    res.status(200).json({defined: true, serverId: defaultDemistoApiName});
  }
  else {
    res.status(200).json({defined: false});
  }
});



app.post(apiPath + '/demistoEndpoint', async (req, res) => {
    // add a new XSOAR API server config
    // will overwrite existing config for url

    let config = req.body;

    // check for client body fields
    if (! 'url' in config) {
      return returnError(`Client did not send url`, res);
    }
    if (! 'apiKey' in config) {
      return returnError(`Client did not send apiKey`, res);
    }
    if (! 'trustAny' in config) {
      return returnError(`Client did not send trustAny`, res);
    }

    // remove any junk data
    config = {
      url: config.url,
      apiKey: config.apiKey,
      trustAny: config.trustAny
    };

    demistoApiConfigs[config.url] = config;
    await saveApiConfig();
    res.status(200).json({success: true});
});



app.post(apiPath + '/demistoEndpoint/update', async (req, res) => {
    // saves XSOAR API config
    // will overwrite existing config for url

    let config = req.body;

    // check for client body fields
    if (! 'url' in config) {
      return returnError(`Client did not send url`, res);
    }
    if (!('apiKey' in req.body || 'serverId' in req.body)) {
      return returnError('Client did not send apiKey or serverId', res);
    }
    if (! 'trustAny' in config) {
      return returnError(`Client did not send trustAny`, res);
    }

    let apiKey;
    let serverId;
    const foundApiKey = 'apiKey' in config;
    if (!foundApiKey) {
      serverId = config.serverId;
      apiKey = getDemistoApiConfig(serverId).apiKey;
    }
    else {
      serverId = config.serverId;
      apiKey = config.apiKey;
    }

    // remove any junk data
    config = {
      url: config.url,
      apiKey: apiKey,
      trustAny: config.trustAny
    };

    if (serverId !== config.url) {
      delete demistoApiConfigs[serverId];
    }
    demistoApiConfigs[config.url] = config;

    if (defaultDemistoApiName === serverId) {
      // update the default server, if necessary
      defaultDemistoApiName = config.url;
    }


    await saveApiConfig();
    res.status(200).json({success: true});
});



app.delete(apiPath + '/demistoEndpoint/:serverId', async (req, res) => {
  // deletes a XSOAR server from the API config
  const serverId = decodeURIComponent(req.params.serverId);
  if (serverId in demistoApiConfigs) {
    delete demistoApiConfigs[serverId];
    if (!(defaultDemistoApiName in demistoApiConfigs)) {
      // make sure default api is still defined.  If not, unset it
      defaultDemistoApiName = undefined;
    }
    await saveApiConfig();
    res.status(200).json({success: true});
  }
  else {
    return returnError(`XSOAR server '${serverID}' was not found`, res);
  }
});




app.get(apiPath + '/demistoEndpoint', async (req, res) => {
  // return all demisto API configs to the client, minus their apiKeys
  let tmpDemistoApiConfigs = JSON.parse(JSON.stringify(demistoApiConfigs));
  Object.values(tmpDemistoApiConfigs).forEach( apiConfig => {
    delete apiConfig.apiKey;
  });
  res.status(200).json(tmpDemistoApiConfigs);
});



app.get(apiPath + '/incidentFields/:serverId', async (req, res) => {
  // Retrieves incident fields from XSOAR
  const serverId = decodeURIComponent(req.params.serverId);
  const fields = await getIncidentFields(serverId);
  incident_fields[serverId] = fields;
  res.json( {id: serverId, incident_fields: fields} );
} );



app.get(apiPath + '/incidentType/:serverId', async (req, res) => {
  // Retrieves the list of incident types from XSOAR
  const serverId = decodeURIComponent(req.params.serverId);
  const incident_types = await getIncidentTypes(serverId);
  res.json( {id: serverId, incident_types} );
} );



app.post(apiPath + '/createDemistoIncident', async (req, res) => {
  // This method will create an XSOAR incident, per the body supplied by the client

  let currentUser = req.headers.authorization;

  let body = req.body;
  let demistoServerConfig;
  try {
    const serverId = body.serverId;
    demistoServerConfig = getDemistoApiConfig(serverId);
  }
  catch {
    return returnError(`'serverId' field not present in body`, res, { success: false, statusCode: 500, error });
  }

  // console.debug(body);

  let result;
  let options = {
    url: demistoServerConfig.url + '/incident',
    method: 'POST',
    headers: {
      Authorization: decrypt(demistoServerConfig.apiKey),
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    rejectUnauthorized: !demistoServerConfig.trustAny,
    resolveWithFullResponse: true,
    json: true,
    body: body
  };

  try {
    // send request to XSOAR
    result = await request( options );
  }
  catch (error) {
    if ( error && 'response' in error && error.response && 'statusCode' in error.response && error.statusCode !== null) {
      return returnError(`Caught error opening XSOAR incident: code ${error.response.status}: ${error.response.statusMessage}`, res, { success: false, statusCode: error.statusCode, statusMessage: error.response.statusMessage });
    }
    else if (error && 'message' in error) {
      return returnError(`Caught error opening XSOAR incident: ${error.message}`, res, { success: false, statusCode: null, error: error.message });
    }
    else {
      return returnError(`Caught unspecified error opening XSOAR incident: ${error}`, res, { success: false, statusCode: 500, error: 'unspecified' });
    }
    return;
  }

  let incidentId = result.body.id;
  // send results to client
  res.json( { id: incidentId, success: true, statusCode: result.statusCode, statusMessage: result.statusMessage } );
  // console.debug(result);
  console.log(`User ${currentUser} created XSOAR incident with id ${incidentId}`);
} );



app.post(apiPath + '/createDemistoIncidentFromJson', async (req, res) => {
  // This method will create an XSOAR incident, per the json property supplied by the client in the body

  const currentUser = req.headers.authorization;
  const body = req.body;

  const requiredFields = ['serverId', 'json'];
  try {
    checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing`});
    return;
  }
  
  const json = body.json;
  let demistoServerConfig;
  try {
    const serverId = body.serverId;
    demistoServerConfig = getDemistoApiConfig(serverId);
  }
  catch(error) {
    return returnError('message' in error ? error.message : errror, res, { success: false, statusCode: 500, error });
  }

  // console.debug(body);

  let result;
  let options = {
    url: demistoServerConfig.url + '/incident/json',
    method: 'POST',
    headers: {
      Authorization: decrypt(demistoServerConfig.apiKey),
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    rejectUnauthorized: !demistoServerConfig.trustAny,
    resolveWithFullResponse: true,
    json: true,
    body: json
  };

  try {
    // send request to XSOAR
    result = await request( options );
    // console.log('result:', result);
  }
  catch (error) {
    if ( error && 'response' in error && error.response && 'statusCode' in error.response && error.statusCode !== null) {
      return returnError(`Caught error opening XSOAR incident: code ${error.response.status}: ${error.response.statusMessage}`, res, { success: false, statusCode: error.statusCode, statusMessage: error.response.statusMessage });
    }
    else if (error && 'message' in error) {
      return returnError(`Caught error opening XSOAR incident: ${error.message}`, res, { success: false, statusCode: null, error: error.message });
    }
    else {
      return returnError(`Caught unspecified error opening XSOAR incident: ${error}`, res, { success: false, statusCode: 500, error: 'unspecified' });
    }
    return;
  }

  // console.log('result body:', result.body);

  if (result.body) {
    const incidentId = result.body.id;
    // send results to client
    res.json( { id: incidentId, success: true, statusCode: result.statusCode, statusMessage: result.statusMessage } );
    // console.debug(result);
    console.log(`User ${currentUser} created XSOAR incident with id ${incidentId}`);
  }

  else {
    // this can happen if an incident didn't get created, possibly due to preprocessing rules
    const error = `XSOAR did not create an incident based off of the request.  It could be caused by pre-processing rules dropping the incident`
    res.json( {success: false, statusCode: result.statusCode, statusMessage: error});
  }

} );



app.post(apiPath + '/createInvestigation', async (req, res) => {
  // creates a demisto investigation (as opposed to an incident)
  const incidentId = `${req.body.incidentId}`; // coerce id into a string

  let demistoServerConfig;
  try {
    const serverId = req.body.serverId;
    demistoServerConfig = getDemistoApiConfig(serverId);
  }
  catch {
    return returnError(`'serverId' field not present in body`, res, { success: false, statusCode: 500, error });
  }

  const body = {
    id: incidentId,
    version: 1
  };

  let result;
  let options = {
    url: demistoServerConfig.url + '/incident/investigate',
    method: 'POST',
    headers: {
      Authorization: decrypt(demistoServerConfig.apiKey),
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    rejectUnauthorized: !demistoServerConfig.trustAny,
    resolveWithFullResponse: true,
    json: true,
    body: body
  };
  try {
    // send request to XSOAR
    result = await request( options );
    res.json({success: true});
  }
  catch (error) {
    if ('error' in error && error.error.error.startsWith('Investigation already exists for incident')) {
      res.json({success: true});
      return;
    }
    res.json({success: false});
  }
} );



app.post(apiPath + '/demistoIncidentImport', async (req, res) => {
  // imports an incident from XSOAR
  try {
    const incidentId = `${req.body.incidentId}`; // coerce id into a string

    let demistoServerConfig;
    try {
      const serverId = req.body.serverId;
      demistoServerConfig = getDemistoApiConfig(serverId);
    }
    catch {
      return returnError(`'serverId' field not present in body`, res, { success: false, statusCode: 500, error });
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
    let options = {
      url: demistoServerConfig.url + '/incidents/search',
      method: 'POST',
      headers: {
        Authorization: decrypt(demistoServerConfig.apiKey),
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      rejectUnauthorized: !demistoServerConfig.trustAny,
      resolveWithFullResponse: true,
      json: true,
      body: body
    };

    // send request to XSOAR
    result = await request( options );

    if ('body' in result && 'total' in result.body && result.body.total === 0) {
      return res.json({
        success: false,
        error: `Query returned 0 results`
      });
    }
    else {
      return res.json({
        success: true,
        incident: result.body.data[0]
      });
    }
    // console.log('result:', result.body);
  }
  catch (error) {
    if ('message' in error) {
      return res.json({success: false, error: error.message});
    }
    return res.json({success: false, error: error});
  }
} );



/// Freeform JSON ///

app.post(apiPath + '/json', async (req, res) => {
  // save new freeform JSON
  let body = req.body;
  const requiredFields = ['name', 'json'];

  try {
    checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing`});
    return;
  }

  const name = body.name;
  const json = body.json;
  const id = uuidv4();

  // check for existing json name
  if (name in freeJsonConfig) {
    const error = `Invalid request: Name '${name}' is already defined`;
    res.status(400).json({error});
    return;
  }

  const entry = {
    name,
    id,
    json
  };

  freeJsonConfig[name] = entry;
  await saveFreeJsonConfig();

  res.status(201).json({success: true}); // send 'created'
} );



app.delete(apiPath + '/json/:name', async (req, res) => {
  // delete a freeform JSON config
  const name = req.params.name;
  let saveGroups = false;
  let saveIncidents = false;
  if (name in freeJsonConfig) {
      delete freeJsonConfig[name];
      
      for (const jsonGroup of Object.values(jsonGroupsConfig)) {
        // remove deleted JSON from groups
        for (let i = jsonGroup.length - 1; i >= 0; i--) {
          const jsonConfigName = jsonGroup[i];
          if (jsonConfigName === name) {
            jsonGroup.splice(i, 1);
            saveGroups = true;
          }
        }
      }

      for (const incidentConfig of Object.values(incidentsConfig)) {
        // remove deleted JSON as default file for incident configs
        if (incidentConfig.defaultJsonName === name) {
          delete incidentConfig.defaultJsonName;
          saveIncidentConfigs = true;
        }
      }

      await saveFreeJsonConfig();
      if (saveGroups) {
        await saveJsonGroupsConfig();
      }
      if (saveIncidents) {
        await saveIncidentsConfig();
      }
      res.status(200).json({name, success: true});
      return;
    }
    else {
      const error = 'Resource not found';
      res.status(400).json({error, name, success: false});
      return;
    }
} );



app.get(apiPath + '/json', async (req, res) => {
  // retrieve all freeform JSON config names
  const freeJsonNames = Object.values(freeJsonConfig).map( config => config.name );
  res.status(200).json(freeJsonNames);
} );



app.get(apiPath + '/json/:name', async (req, res) => {
  // get a particular freeform JSON config (just the json)
  const name = req.params.name;
  if (name in freeJsonConfig) {
    res.status(200).json(freeJsonConfig[name].json);
    return;
  }
  else {
    const error = `Freeform JSON config ${'name'} was not found`;
    res.status(400).json({error});
    return;
  }
} );



/// Incident Configs ///



app.post(apiPath + '/incidentConfig', async (req, res) => {
  // save a new incident config
  let body = req.body;
  const requiredFields = ['name', 'chosenFields', 'createInvestigation', 'incidentType'];

  try {
    checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing`});
    return;
  }

  const name = body.name;
  const id = uuidv4();
  const chosenFields = body.chosenFields;
  const createInvestigation = body.createInvestigation;
  const incidentType = body.incidentType;

  // check for existing config name
  if (name in incidentsConfig) {
    const error = `Invalid request: Name '${name}' is already defined`;
    res.status(400).json({error});
    return;
  }

  // remove any invalid fields
  const entry = {
    name,
    id,
    incidentType,
    chosenFields,
    createInvestigation
  };

  incidentsConfig[name] = entry;
  await saveIncidentsConfig();

  res.status(201).json({success: true}); // send 'created'
} );



app.post(apiPath + '/incidentConfig/update', async (req, res) => {
  // update an existing field config
  const body = req.body;
  const requiredFields = ['name', 'chosenFields', 'createInvestigation', 'incidentType'];

  for (let i = 0; i < requiredFields.length; i++) {
    // check for valid request
    let fieldName = requiredFields[i];
    if (!(fieldName in body)) {
      const error = `Invalid request: Key '${fieldName}' is missing`;
      res.status(400).json({error});
      return;
    }
  }

  if (body.id === '') {
    const error = `Invalid request: 'id' key may not be empty`;
    res.status(400).json({error});
    return;
  }

  // remove any invalid fields
  const updatedField = {
    name: body.name,
    id: body.id,
    incidentType: body.incidentType,
    chosenFields: body.chosenFields,
    createInvestigation: body.createInvestigation
  };

  incidentsConfig[body.name] = updatedField;
  await saveIncidentsConfig();

  res.status(200).json({success: true});; // send 'OK'
} );



app.post(apiPath + '/incidentConfig/defaultJson', async (req, res) => {
  // update an existing field config's default JSON file
  const body = req.body;
  const requiredFields = ['configName', 'jsonName'];

  try {
    checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    return res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing`});
  }

  const configName = body.configName;
  const jsonName = body.jsonName; // set to null to clear default

  if (!(configName in incidentsConfig)) {
    return res.status(400).json({error: `Incident config ${configName} is not defined`});
  }

  if (jsonName !== null && !(jsonName in freeJsonConfig)) {
    return res.status(400).json({error: `JSON config ${jsonName} is not defined`});
  }

  const incidentConfig = incidentsConfig[configName];
  if (jsonName === null && 'defaultJsonName' in incidentConfig) {
    delete incidentConfig['defaultJsonName'];
    console.log(`Cleared default JSON config for incident config ${incidentConfig.name}`);
  }
  else if (jsonName !== null) {
    incidentConfig['defaultJsonName'] = jsonName;
    console.log(`Set default JSON config to ${jsonName} for incident config ${incidentConfig.name}`);
  }

  await saveIncidentsConfig();

  res.status(200).json({success: true});; // send 'OK'
} );



app.get(apiPath + '/incidentConfig/all', async (req, res) => {
  // retrieve all field configs -- must come before /incidentConfig/:name
  res.status(200).json(incidentsConfig);
} );



app.get(apiPath + '/incidentConfig/:name', async (req, res) => {
  // get a particular field config
  const name = req.params.name;
  if (name in incidentsConfig) {
    res.status(200).json(incidentsConfig[name]);
    return;
  }
  else {
    const error = `Config ${'name'} was not found`;
    res.status(400).json({error});
    return;
  }
} );



app.delete(apiPath + '/incidentConfig/:name', async (req, res) => {
  // delete an incident config
  const name = req.params.name;
  if (name in incidentsConfig) {
      delete incidentsConfig[name];
      await saveIncidentsConfig();
      res.status(200).json({name, success: true});
      return;
    }
    else {
      const error = 'Resource not found';
      res.status(400).json({error, name, success: false});
      return;
    }
} );


// JSON GROUPS //

app.post(apiPath + '/jsonGroup', async (req, res) => {
  // save a new JSON group config
  let body = req.body;
  const requiredFields = ['name', 'jsonConfigs'];

  try {
    checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing`});
    return;
  }

  const name = body.name;
  const jsonConfigs = body.jsonConfigs;

  try {
    validateJsonGroup(jsonConfigs);
  }
  catch(error) {
    res.status(400).json({error: `Invalid request: ${error}`});
    return;
  }

  // check for existing config name
  if (name in jsonConfigs) {
    const error = `Invalid request: JSON Group '${name}' is already defined`;
    return res.status(400).json({error});
  }

  jsonGroupsConfig[name] = jsonConfigs;
  await saveJsonGroupsConfig();

  res.status(201).json({success: true}); // send 'created'
} );



app.post(apiPath + '/jsonGroup/update', async (req, res) => {
  // update an existing JSON group config
  const body = req.body;
  const requiredFields = ['name', 'jsonConfigs'];;

  try {
    checkForRequiredFields(requiredFields, body);
  }
  catch(fieldName) {
    res.status(400).json({error: `Invalid request: Required field '${fieldName}' was missing`});
    return;
  }

  const name = body.name;
  const jsonConfigs = body.jsonConfigs;

  try {
    validateJsonGroup(jsonConfigs);
  }
  catch(error) {
    res.status(400).json({error: `Invalid request: ${error}`});
    return;
  }

  // check for existing config name
  if (!(name in jsonGroupsConfig)) {
    const error = `Invalid request: JSON Group '${name}' is not defined`;
    return res.status(400).json({error});
  }

  jsonGroupsConfig[name] = jsonConfigs;
  await saveJsonGroupsConfig();

  res.status(200).json({success: true});; // send 'OK'
} );



app.get(apiPath + '/jsonGroup/all', async (req, res) => {
  // retrieve all JSON Group config names
  const config = {};
  for (const groupName of Object.keys(jsonGroupsConfig)) {
    config[groupName] = {
      name: groupName,
      jsonConfigs: jsonGroupsConfig[groupName]
    };
  }
  res.status(200).json(config);
} );



app.delete(apiPath + '/jsonGroup/:name', async (req, res) => {
  // delete a JSON Group config
  const name = req.params.name;
  if (name in jsonGroupsConfig) {
      delete jsonGroupsConfig[name];
      await saveJsonGroupsConfig();
      res.status(200).json({name, success: true});
      return;
    }
    else {
      const error = `JSON Group '${name}' not found`;
      res.status(400).json({error, name, success: false});
      return;
    }
} );





///// STARTUP UTILITY FUNCTIONS //////

async function loadDemistoApiConfigs() {
  // Read XSOAR API configs
  if (!foundDemistoApiConfig) {
    console.log('No XSOAR API configuration was found');
  }
  else {
    let parsedApiConfig = JSON.parse(fs.readFileSync(apiCfgFile, 'utf8'));
    // console.log(parsedApiConfig);

    if ('url' in parsedApiConfig && 'apiKey' in parsedApiConfig && 'trustAny' in parsedApiConfig) {
      // convert legacy api config
      let tmpConfig = {
        servers: {
          [parsedApiConfig.url]: parsedApiConfig
        },
        default: parsedApiConfig.url
      };
      if ('apiKey' in tmpConfig.servers[parsedApiConfig.url]) {
        tmpConfig.servers[parsedApiConfig.url].apiKey = encrypt(tmpConfig.servers[parsedApiConfig.url].apiKey);
      }
      demistoApiConfigs = tmpConfig.servers;
      defaultDemistoApiName = parsedApiConfig.url;
      parsedApiConfig = tmpConfig;
      await saveApiConfig();
    }

    demistoApiConfigs = parsedApiConfig.servers;

    // identify the default demisto api config
    let demistoServerConfig;
    if ('default' in parsedApiConfig) {
      defaultDemistoApiName = parsedApiConfig.default;
      console.log(`The default API config is '${defaultDemistoApiName}'`);
      demistoServerConfig = getDemistoApiConfig(defaultDemistoApiName);
    }


    if (demistoServerConfig && 'url' in demistoServerConfig && 'apiKey' in demistoServerConfig && 'trustAny' in demistoServerConfig) {
      console.log('Testing default XSOAR API server API communication');

      // test API communication
      let testResult;
      try {
        testResult = await testApi(demistoServerConfig.url, decrypt(demistoServerConfig.apiKey), demistoServerConfig.trustAny);
      }
      catch (error) {
        if ('message' in error && error.message.startsWith('Error during decryption')) {
          console.log(`Decryption failed.  This probably means you installed new certificates.  Please delete ${apiCfgFile} and try again.`)
        }
        else {
          console.log(error.message);
        }
        process.exit(1);
      }

      if (testResult.success) {
        console.log(`Logged into XSOAR as user '${testResult.result.body.username}'`);
        console.log('XSOAR API is initialised');

        // fetch incident fields
        incident_fields = await getIncidentFields(defaultDemistoApiName);
      }
      else {
        console.error(`XSOAR API initialisation failed with URL ${defaultDemistoApiName} with trustAny = ${demistoApiConfigs[defaultDemistoApiName].trustAny}.`);
      }
    }
  }
}



function loadIncidentsConfig() {
  // Read Field Configs
  if (!foundIncidentsFile) {
    console.log(`Incidents configuration file ${incidentsFile} was not found`);
    incidentsConfig = {};
  }
  else {
    try {
      incidentsConfig = JSON.parse(fs.readFileSync(incidentsFile, 'utf8'));
    }
    catch (error) {
      console.error(`Error parsing ${incidentsFile}:`, error);
      incidentsConfig = {};
    }
  }
  calculateRequiresJson();
}



function loadFreeJsonConfig() {
  // Read Freeform JSON Configs
  if (!foundFreeJsonFile) {
    console.log(`Freeform JSON configuration file ${freeJsonFile} was not found`);
    freeJsonConfig = {};
  }
  else {
    try {
      freeJsonConfig = JSON.parse(fs.readFileSync(freeJsonFile, 'utf8'));
    }
    catch (error) {
      console.error(`Error parsing ${freeJsonFile}:`, error);
      freeJsonConfig = {};
    }
  }
}




function loadJsonGroupsConfig() {
  // Read JSON Config Groups
  jsonGroupsConfig = {};
  if (!foundJsonGroupsFile) {
    console.log(`JSON Groups configuration file ${jsonGroupsFile} was not found`);
  }
  else {
    try {
      jsonGroupsConfig = JSON.parse(fs.readFileSync(jsonGroupsFile, 'utf8'));
    }
    catch (error) {
      console.error(`Error parsing ${jsonGroupsFile}:`, error);
    }
  }
}



function genInternalCerts() {
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
  fs.writeFileSync(internalPubKeyFile, dos2unix(pems.public), { encoding: 'utf8', mode: 0o660 });
  fs.writeFileSync(internalKeyFile, dos2unix(pems.private), { encoding: 'utf8', mode: 0o660 });
}



function genSSLCerts() {
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
  fs.writeFileSync(certFile, dos2unix(pems.cert), { encoding: 'utf8', mode: 0o660 });
  fs.writeFileSync(privKeyFile, dos2unix(pems.private), { encoding: 'utf8', mode: 0o660 });
}



function initSSL() {

  // SSL Certs
  const privkeyExists = fs.existsSync(privKeyFile);
  const certExists = fs.existsSync(certFile);
  if (!privkeyExists && !certExists) {
    genSSLCerts()
  }
  else if (!privkeyExists) {
    console.error(`SSL private key file ${privKeyFile} not found`);
    return false;
  }
  else if (!certExists) {
    console.error(`SSL certificate file ${certFile} not found`);
    return false;
  }

  sslCert = fs.readFileSync(certFile, { encoding: 'utf8' });
  privKey = fs.readFileSync(privKeyFile, { encoding: 'utf8' });
  server = require('https').createServer({
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
    return false;
  }
  else if (!internalCertExists) {
    console.error(`Internal certificate file ${internalPubKeyFile} not found`);
    return false;
  }

  internalPubKey = fs.readFileSync(internalPubKeyFile, { encoding: 'utf8' });
  const internalPrivKey = fs.readFileSync(internalKeyFile, { encoding: 'utf8' });

  const NodeRSA = require('node-rsa');
  encryptor = new NodeRSA( internalPrivKey );
  encryptor.setOptions({encryptionScheme: 'pkcs1'});

  return true;
}



///// FINISH STARTUP //////

(async function() {

  if ( !initSSL() ) {
    const exitCode = 1;
    console.error(`SSL initialisation failed.  Exiting with code ${exitCode}`);
    process.exit(exitCode);
  }

  await loadDemistoApiConfigs();

  loadIncidentsConfig();
  loadFreeJsonConfig();
  loadJsonGroupsConfig();

  if (foundDist && !devMode) {
    // Serve compiled Angular files statically
    console.log('Found dist/ directory.  Serving client from there');
    app.use(express.static(staticDir));
  }

  else {
    // Proxy client connections to the 'ng serve' instance
    console.log(`Enabling client development mode -- proxying Angular development server at ${proxyDest}`);

    var proxy = require('express-http-proxy'); // express-http-proxy supports being tied to defined express routes
    app.use('/', proxy(proxyDest));

    // proxy websockets to enable live reload - must use separate proxy lib
    var httpProxy = require('http-proxy');
    var wsProxy = httpProxy.createProxyServer({ ws: true });
    server.on('upgrade', function (req, socket, head) {
      wsProxy.ws(req, socket, head, { target: proxyDest });
    });
  }

  server.listen(listenPort, () => console.log(`Listening for client connections at https://*:${listenPort}`)); // listen for client connections
})();
