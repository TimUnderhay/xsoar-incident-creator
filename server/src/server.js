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
  fs.writeFileSync(apiCfgFile, JSON.stringify(apiCfg))
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
  saveApiConfig(demistoUrl, demistoApiKey, trustAny);
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
  // fs.readFile(incidentsDir + '/sample.json', {encoding: 'utf8'}, (err, data) => {
  fs.readFile(incidentsDir + '/testIncidentFields.json', {encoding: 'utf8'}, (err, data) => {
    let parsedData = JSON.parse(data);
    res.json(data);
  });
});



app.get(apiPath + '/incidentfields', async (req, res) => {
  incident_fields = await getIncidentFields();
  res.json( {incident_fields} );
} );



app.post(apiPath + '/createDemistoIncident', async (req, res) => {
  // This method will create a Demisto incident to facilitate the provisioning of our new employee

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

  server.listen(listenPort, () => console.log(`Listening on port ${listenPort}`)); // listen for client connections
})();
