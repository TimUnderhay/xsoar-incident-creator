'use strict';

console.log('Demisto incident importer server is starting');

////////////////////// Config and Imports //////////////////////

// Config parameters
const listenPort = 4002;
const proxyDest = 'http://localhost:4200'; // used in client development mode
const apiPath = '/api';

// Demisto API Config
var demistoApiConfigs = {};
var defaultDemistoApiName; // the key/url of the default demistoApiConfig

// Directories and files
const fs = require('fs');
const defsDir = './definitions';
const incidentsDir = '../incidents';
const staticDir = '../../dist/demisto-form';
const foundDist = fs.existsSync(staticDir); // check for presence of pre-built angular client directory
const configDir = '../config';
const apiCfgFile = configDir + '/api.json';
const foundDemistoApiConfig = fs.existsSync(apiCfgFile); // check for presence of API configuration file
const fieldsConfigFile = configDir + '/fields-config.json';
const foundFieldsConfigFile = fs.existsSync(fieldsConfigFile);

// UUID
var uuidv4 = require('uuid/v4');

// Field Configs
var fieldsConfig;

var incident_fields = {};



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
const server = require('http').createServer(app);
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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




////////////////////// API //////////////////////

app.get(apiPath + '/whoami', (req, res) => {
  let currentUser = randomElement(users);
  res.status(200).json( currentUser );
});



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
    json: true
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



app.post(apiPath + '/demistoApi/test/adhoc', async (req, res) => {
  // Tests for good connectivity to Demisto server by fetching user settings.
  // Does not save settings.  Another call will handle that.
  
  // check for client body fields
  if (! 'url' in req.body) {
    console.error('Client did not send url');
    res.send(400);
    return;
  }
  if (! 'apiKey' in req.body) {
    console.error('Client did not send apiKey');
    res.send(400);
    return;
  }
  if (! 'trustAny' in req.body) {
    console.error('Client did not send trustAny');
    res.send(400);
    return;
  }

  // console.log('body:', req.body);

  let testResult = await testApi(req.body.url, req.body.apiKey, req.body.trustAny);
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
      console.error(`Caught error testing Demisto server with code ${statusCode}:`, error);
      res.json({ success: false, statusCode, error });
    }
    else if (error && !statusCode) {
      console.error(`Caught error testing Demisto server:`, error);
      res.json({ success: false, error });
    }
    else {
      console.error('Caught unspecified error testing Demisto server');
      res.json({ success: false, error: 'unspecified' });
    }
    return;
  }
  console.log(`Logged into Demisto as user '${testResult.result.body.username}'`);
  res.json( { success: true, statusCode: 200 } );
  console.log(`Successfully tested URL '${req.body.url}'`);
});



app.get(apiPath + '/demistoApi/test/:serverId', async (req, res) => {
  // Tests for good connectivity to Demisto server by fetching user settings.
  // Does not save settings.  Another call will handle that.

  const serverId = req.params.serverId;
  const apiToTest = getDemistoApiConfig(serverId);

  // console.log('body:', req.body);

  let testResult = await testApi(apiToTest.url, apiToTest.apiKey, apiToTest.trustAny);
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
      console.error(`Caught error testing Demisto server with code ${statusCode}:`, error);
      res.json({ success: false, statusCode, error });
    }
    else if (error && !statusCode) {
      console.error(`Caught error testing Demisto server:`, error);
      res.json({ success: false, error });
    }
    else {
      console.error('Caught unspecified error testing Demisto server');
      res.json({ success: false, error: 'unspecified' });
    }
    return;
  }
  console.log(`Logged into Demisto as user '${testResult.result.body.username}'`);
  res.json( { success: true, statusCode: 200 } );
  console.log(`Successfully tested URL '${req.body.url}'`);
});



app.post(apiPath + '/demistoApi/default', async (req, res) => {
  // sets the default Demisto API endpoint
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
    return returnError(`${serverId} is not a known Demisto API endpoint`, res);
  }
});



app.get(apiPath + '/demistoApi/default', async (req, res) => {
  // fetch the default Demisto API endpoint
  if (defaultDemistoApiName) {
    res.status(200).json({defined: true, serverId: defaultDemistoApiName});
  }
  else {
    res.status(200).json({defined: false});
  }
});



app.post(apiPath + '/demistoApi', async (req, res) => {
    // saves Demisto API config
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



app.delete(apiPath + '/demistoApi/:serverId', async (req, res) => {
  // deletes a Demisto server from the API config
  const serverId = req.params.id;
  if (serverId in demistoApiConfigs) {
    delete demistoApiConfigs[serverId];
    res.status(200).json({success: true});
    await saveApiConfig();
  }
  else {
    return returnError(`Demisto server '${serverID}' was not found`, res);
  }
});




app.get(apiPath + '/demistoApi', async (req, res) => {
  // return all demisto API configs to the client, minus their apiKeys
  let tmpDemistoApiConfigs = JSON.parse(JSON.stringify(demistoApiConfigs));
  Object.values(tmpDemistoApiConfigs).forEach( apiConfig => {
    delete apiConfig.apiKey;
  });
  res.status(200).json(tmpDemistoApiConfigs);
});




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




async function getIncidentFields(demistoUrl) {
  // This method will get incident field definitions from a Demisto server
  
  let demistoServerConfig = getDemistoApiConfig(demistoUrl);

  console.log(`Fetching incident fields from '${demistoServerConfig.url}'`);

  let result;
  let options = {
    url: demistoServerConfig.url + '/incidentfields',
    method: 'GET',
    headers: {
      Authorization: demistoServerConfig.apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    rejectUnauthorized: !demistoServerConfig.trustAny,
    resolveWithFullResponse: true,
    json: true
  }

  try {
    // send request to Demisto
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
    console.error('Caught error fetching Demisto fields configuration:', error);
    return;
  }
}



app.get(apiPath + '/sampleincident', async (req, res) => {
  let data;
  const fileName = 'testIncidentFields.json';
  const filePath = `${incidentsDir}/${fileName}`;
  try {
    // read file
    data = await fs.promises.readFile(filePath, { encoding: 'utf8' });
  }
  catch (error) {
    console.error(`Error whilst parsing file ${fileName}:`, error);
    res.status(500).json({error})
    return;
  }

  try {
    // parse file contents
    const parsedData = JSON.parse(data);
    res.json(parsedData);
    return;
  }
  catch (error) {
    console.log(`Caught error parsing ${filePath}:`, error);
    res.status(500).json({error})
    return;
  }
  
});



app.get(apiPath + '/incidentfields/:serverId', async (req, res) => {
  const serverId = req.params.id;
  const fields = await getIncidentFields(serverId);
  incident_fields[serverId] = fields;
  res.json( {id: serverId, incident_fields: fields} );
} );



app.post(apiPath + '/createDemistoIncident', async (req, res) => {
  // This method will create a Demisto incident, per the body supplied by the client

  let currentUser = req.headers.authorization;

  let body = req.body;
  let demistoServerConfig;
  try {
    const serverId = body.serverId;
    demistoServerConfig = getDemistoApiConfig(serverId);
  }
  catch {
    const error = `'serverId' field not present in body`;
    console.error(error);
    res.status(500).json({ success: false, statusCode: 500, error });
    return;
  }

  // console.debug(body);
  
  let result;
  let options = {
    url: demistoServerConfig.url + '/incident',
    method: 'POST',
    headers: {
      Authorization: demistoServerConfig.apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    rejectUnauthorized: !demistoServerConfig.trustAny,
    resolveWithFullResponse: true,
    json: true,
    body: body
  };

  try {
    // send request to Demisto
    result = await request( options );
  }
  catch (error) {
    if ( error && 'response' in error && error.response && 'statusCode' in error.response && error.statusCode !== null) {
      console.error(`Caught error opening Demisto incident: code ${error.response.status}: ${error.response.statusMessage}`);
      res.status(500).json( { success: false, statusCode: error.statusCode, statusMessage: error.response.statusMessage } );
    }
    else if (error && 'message' in error) {
      console.error('Caught error opening Demisto incident:', error.message);
      res.status(500).json({ success: false, statusCode: null, error: error.message });
    }
    else {
      console.error('Caught unspecified error opening Demisto incident:', error);
      res.status(500).json({ success: false, statusCode: 500, error: 'unspecified' });
    }
    return;
  }

  let incidentId = result.body.id;
  // send results to client
  res.json( { id: incidentId, success: true, statusCode: result.statusCode, statusMessage: result.statusMessage } );
  // console.debug(result);
  console.log(`User ${currentUser} created Demisto incident with id ${incidentId}`);
} );



function saveFieldsConfig() {
  return fs.promises.writeFile(fieldsConfigFile, JSON.stringify(fieldsConfig, null, 2), { encoding: 'utf8', mode: 0o660});
}



app.post(apiPath + '/fieldConfig', async (req, res) => {
  // save a new field config
  let body = req.body;
  const requiredFields = ['name', 'incident', 'customFieldsConfig', 'incidentFieldsConfig', 'createInvestigation'];
  for (let i = 0; i < requiredFields.length; i++) {
    // check for valid request
    let fieldName = requiredFields[i];
    if (!(fieldName in body)) {
      const error = `Invalid request: Key '${fieldName}' missing`;
      res.status(400).json({error});
      return;
    }
  }

  // check for existing config name
  if ('name' in fieldsConfig) {
    const error = `Invalid request: Name '${body.name}' is already defined`;
    res.status(400).json({error});
    return;
  }

  const id = uuidv4();

  // remove any invalid fields
  const newBody = {
    name: body.name,
    id,
    incident: body.incident,
    customFieldsConfig: body.customFieldsConfig,
    incidentFieldsConfig: body.incidentFieldsConfig,
    createInvestigation: body.createInvestigation
  };

  fieldsConfig[newBody.name] = newBody;
  await saveFieldsConfig();

  res.status(201).json({success: true}); // send 'created'
} );



app.post(apiPath + '/fieldConfig/update', async (req, res) => {
  // update an existing field config
  const body = req.body;
  const requiredFields = ['name', 'id', 'incident', 'customFieldsConfig', 'incidentFieldsConfig', 'createInvestigation'];

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
    incident: body.incident,
    customFieldsConfig: body.customFieldsConfig,
    incidentFieldsConfig: body.incidentFieldsConfig,
    createInvestigation: body.createInvestigation
  };

  fieldsConfig[body.name] = updatedField;
  await saveFieldsConfig();

  res.status(200).json({success: true});; // send 'OK'
} );



app.get(apiPath + '/fieldConfig/all', async (req, res) => {
  // retrieve all field configs -- must come before /fieldConfig/:name
  res.status(200).json(fieldsConfig);
} );



app.get(apiPath + '/fieldConfig/:name', async (req, res) => {
  // get a particular field config
  const name = req.params.name;
  if (name in fieldsConfig) {
    res.status(200).json(fieldsConfig[name]);
    return;
  }
  else {
    const error = `Config ${'name'} was not found`;
    res.status(400).json({error});
    return;
  }
} );



app.delete(apiPath + '/fieldConfig/:name', async (req, res) => {
  // delete a field config
  const name = req.params.name;
  if (name in fieldsConfig) {
      delete fieldsConfig[name];
      await saveFieldsConfig();
      res.status(200).json({name, success: true});
      return;
    }
    else {
      const error = 'Resource not found';
      res.status(400).json({error, name, success: false});
      return;
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
    const error = `'serverId' field not present in body`;
    console.error(error);
    res.status(500).json({ success: false, statusCode: 500, error });
    return;
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
      Authorization: demistoServerConfig.apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    rejectUnauthorized: !demistoServerConfig.trustAny,
    resolveWithFullResponse: true,
    json: true,
    body: body
  };
  try {
    // send request to Demisto
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



function returnError(error, res) {
  console.error(error);
  res.status(500).json({success: false, error});
}





///// UTILITY FUNCTIONS //////

async function loadDemistoApiConfigs() {
  // Read Demisto API configs
  if (!foundDemistoApiConfig) {
    console.log('No Demisto API configuration was found');
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
      console.log('Testing default Demisto API server API communication');
      
      // test API communication
      let testResult = await testApi(demistoServerConfig.url, demistoServerConfig.apiKey, demistoServerConfig.trustAny);

      if (testResult.success) {
        console.log(`Logged into Demisto as user '${testResult.result.body.username}'`);
        console.log('Demisto API is initialised');

        // fetch incident fields
        incident_fields = await getIncidentFields(defaultDemistoApiName);
      }
      else {
        console.error(`Demisto API initialisation failed with URL ${defaultDemistoApiName} with trustAny: ${defaultDemistoApiName.trustAny}.  Using default configuration.`);
      }
    }
  }
}



function loadFieldConfigs() {
  // Read Field Configs
  if (!foundFieldsConfigFile) {
    console.log('Fields configuration file was not found');
    fieldsConfig = {};
  }
  else {
    try {
      fieldsConfig = JSON.parse(fs.readFileSync(fieldsConfigFile, 'utf8'));
    }
    catch (error) {
      console.error(`Error parsing ${fieldsConfigFile}:`, error);
      fieldsConfig = {};
    }
  }
}



function getDemistoApiConfig(serverId) {
  return demistoApiConfigs[serverId];
}



///// FINISH STARTUP //////

(async function() {
  
  await loadDemistoApiConfigs();
  
  loadFieldConfigs();

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

  server.listen(listenPort, () => console.log(`Listening for client connections at http://*:${listenPort}`)); // listen for client connections
})();
