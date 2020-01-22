'use strict';

console.log('Demisto incident importer server is starting');

////////////////////// Config and Imports //////////////////////

// Config parameters
const listenPort = 4002;
const proxyDest = 'http://localhost:4200'; // used in client development mode
const apiPath = '/api';
var demistoUrl = ''; // the Demisto base URL
var demistoApiKey = '';
var trustAny = null; // boolean -- whether to trust any Demisto server certificiate

// Directories and files
const fs = require('fs');
const defsDir = './definitions';
const incidentsDir = '../incidents';
const staticDir = '../../dist/demisto-form';
const foundDist = fs.existsSync(staticDir); // check for presence of pre-built angular client directory
const configDir = '../config';
const apiCfgFile = configDir + '/api.json';
const foundApiConfig = fs.existsSync(apiCfgFile); // check for presence of API configuration file
const fieldsConfigFile = configDir + '/fields-config.json';
const foundFieldsConfigFile = fs.existsSync(fieldsConfigFile);

// UUID
var uuidv4 = require('uuid/v4');

// Field Configs
var fieldsConfig;



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



app.get(apiPath + '/apiStatus', (req, res) => {
  // Tells the client whether the Demisto API has already been initialised
  let statusGood = demistoUrl !== '' && demistoApiKey !== '';
  let response = {
    initialised: statusGood
  }
  if (statusGood) {
    response['url'] = demistoUrl;
    response['trust'] = trustAny;
  }
  res.status(200).json( response );
} );



app.get(apiPath + '/clientOptions', (req, res) => {
  res.status(200).json({
    workLocations,
    countries,
    defaultCountry,
    computerTypes,
    activeDirectoryGroups
  })
} );



function saveApiConfig(url, key, trust) {
  let apiCfg = {
    url: url,
    apiKey: key,
    trustAny: trust
  }
  return fs.promises.writeFile(apiCfgFile, JSON.stringify(apiCfg)), { encoding: 'utf8', mode: 0o660};
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



app.post(apiPath + '/testConnect', async (req, res) => {

  // Tests for good connectivity to Demisto server by checking
  // installed content.  If successful, future calls to the Demisto API will use the URL and API key set here.
  
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
    demistoUrl = '';
    demistoApiKey = '';
    trustAny = null;
    
    /*if ( error && 'response' in error && error.response && 'statusCode' in error.response && error.statusCode !== null) {
      console.error('Caught error testing Demisto server:', error.response.statusMessage);
      res.json( { success: false, statusCode: error.statusCode, statusMessage: error.response.statusMessage } );
    }
    else if (error && 'message' in error) {
      console.error('Caught error testing Demisto server:', error.message);
      res.json({ success: false, statusCode: null, error: error.message });
    }*/
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
  demistoUrl = req.body.url;
  demistoApiKey = req.body.apiKey;
  trustAny = req.body.trustAny;
  await saveApiConfig(demistoUrl, demistoApiKey, trustAny);
  res.json( { success: true, statusCode: 200 } );
  console.log(`Demisto API URL set to: ${demistoUrl}`);
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




var incident_fields;

async function getIncidentFields() {
  // This method will get incident field definitions from Demisto

  console.log('Fetching incident fields');

  let result;
  let options = {
    url: demistoUrl + '/incidentfields',
    method: 'GET',
    headers: {
      Authorization: demistoApiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    rejectUnauthorized: !trustAny,
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

    // console.log(incident_fields);

    console.log('Successfully fetched incident fields');
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



app.get(apiPath + '/incidentfields', async (req, res) => {
  incident_fields = await getIncidentFields();
  res.json( {incident_fields} );
} );



app.post(apiPath + '/createDemistoIncident', async (req, res) => {
  // This method will create a Demisto incident, per the body supplied by the client

  let currentUser = req.headers.authorization;

  let body = req.body;

  // console.debug(body);
  
  let result;
  let options = {
    url: demistoUrl + '/incident',
    method: 'POST',
    headers: {
      Authorization: demistoApiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    rejectUnauthorized: !trustAny,
    resolveWithFullResponse: true,
    json: true,
    body: body
  }

  try {
    // send request to Demisto
    result = await request( options );
  }
  catch (error) {
    if ( error && 'response' in error && error.response && 'statusCode' in error.response && error.statusCode !== null) {
      console.error(`Caught error opening Demisto incident: code ${error.response.status}: ${error.response.statusMessage}`);
      res.json( { success: false, statusCode: error.statusCode, statusMessage: error.response.statusMessage } );
    }
    else if (error && 'message' in error) {
      console.error('Caught error opening Demisto incident:', error.message);
      res.json({ success: false, statusCode: null, error: error.message });
    }
    else {
      console.error('Caught unspecified error opening Demisto incident:', error);
      res.json({ success: false, statusCode: 500, error: 'unspecified' });
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
  return fs.promises.writeFile(fieldsConfigFile, JSON.stringify(fieldsConfig), { encoding: 'utf8', mode: 0o660});
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





///// FINISH STARTUP //////

(async function() {
  
  // Read API config
  if (!foundApiConfig) {
    console.log('No Demisto API configuration was found');
  }
  else {
    let apiPrefs = JSON.parse(fs.readFileSync(apiCfgFile, 'utf8'));
    if ('url' in apiPrefs && 'apiKey' in apiPrefs && 'trustAny' in apiPrefs) {
      let testResult = await testApi(apiPrefs.url, apiPrefs.apiKey, apiPrefs.trustAny);
      if (testResult.success) {
        demistoApiKey = apiPrefs.apiKey;
        demistoUrl = apiPrefs.url;
        trustAny = apiPrefs.trustAny;
        console.log(`Logged into Demisto as user '${testResult.result.body.username}'`);
        console.log('Demisto API is initialised');

        // fetch incident fields
        incident_fields = await getIncidentFields();
      }
      else {
        console.error(`Demisto API initialisation failed with URL ${apiPrefs.url} with trustAny: ${apiPrefs.trustAny}.  Using default configuration.`);
      }
    }
  }

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
