import { AppSettings } from 'types/app-settings';

export const DefaultSettings: AppSettings = {
  listenAddress: '0.0.0.0', // must be 0.0.0 for running in a container.  Change to 127.0.0.1 for local development mode
  listenPort: 4002,
  jsonBodyUploadLimit: '10mb', // see https://github.com/expressjs/body-parser : bodyParser.json([options])
  urlEncodedBodyUploadLimit: '10mb', // see https://github.com/expressjs/body-parser : bodyParser.json([options])
  developmentProxyDestination: 'http://localhost:4200'
};
