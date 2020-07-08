import { Component, OnInit, ChangeDetectorRef, ViewChild } from '@angular/core';
import { FetcherService } from './fetcher-service';
import { DemistoEndpoints } from './types/demisto-endpoints';
import { User } from './types/user';
import { DemistoEndpointTestResult, DemistoEndpointTestResults } from './types/demisto-endpoint-status';
import { SelectItem, ConfirmationService } from 'primeng/api';
import { IncidentFieldUI, DateConfig } from './types/incident-fields';
import { FetchedIncidentType } from './types/fetched-incident-types';
import { FetchedIncidentField, FetchedIncidentFieldDefinitions } from './types/fetched-incident-field';
import { IncidentConfig, IncidentConfigs, IncidentCreationConfig } from './types/incident-config';
import { PMessageOption } from './types/message-options';
import { BulkCreateConfigurationToPush, BulkCreateSelection, BulkCreateSelections, BulkCreateResult, EndpointIncidentTypes, EndpointIncidentTypeNames, BulkCreateIncidentJSON, JsonFileIds, BulkCreateRetrieveJSONFilesResults, BulkCreateFetchedIncidentFields, BulkCreateServerTestResults } from './types/bulk-create';
import { FreeformJsonUIComponent } from './freeform-json-ui.component';
import { Subscription } from 'rxjs';
import * as utils from './utils';
import { JsonGroup, JsonGroups } from './types/json-group';
import { DialogService, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { JsonEditorComponent } from './json-editor/json-editor.component';
import { FileAttachmentConfig, FileAttachmentConfigs, FileToPush } from './types/file-attachment';
import { FileUpload } from 'primeng/fileupload';
import { JSONConfigRef, JSONConfigRefs } from './types/json-config';
import { DemistoIncidentImportResult } from './types/demisto-incident-import-result';
import dayjs from 'dayjs';
import utc from 'node_modules/dayjs/plugin/utc';
dayjs.extend(utc);
declare var jmespath: any;

type DemistoServerEditMode = 'edit' | 'new';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  providers: [ DialogService ]
})



export class AppComponent implements OnInit {

  constructor(
    public fetcherService: FetcherService, // import our URL fetcher
    private confirmationService: ConfirmationService,
    private changeDetector: ChangeDetectorRef,
    public dialogService: DialogService
  ) {}

  @ViewChild(FreeformJsonUIComponent) freeformJsonUIComponent: FreeformJsonUIComponent;
  @ViewChild('attachmentUploader') attachmentUploaderComponent: FileUpload;

  loggedInUser: User;

  // Endpoint Properties
  demistoEndpoints: DemistoEndpoints;
  demistoEndpointUrls: string[] = [];
  demistoEndpointsLen = 0;
  defaultDemistoEndpointId: string;
  currentDemistoEndpointId: string;
  currentDemistoEndpointInit = false;
  fetchedIncidentFieldDefinitions: FetchedIncidentFieldDefinitions; // the field definitions loaded from Demisto
  fetchedIncidentTypes: FetchedIncidentType[];

  // For PrimeNG
  messages: PMessageOption[] = [];
  messagesClearTimeout: ReturnType<typeof setTimeout> = null;
  demistoEndpointsItems: SelectItem[]; // holds list of endpoints for PrimeNG
  savedIncidentConfigItems: SelectItem[] = []; // dropdown/listbox options object for all incident configs

  // Saved Incident Configurations
  _savedIncidentConfigurations: IncidentConfigs = {};
  get savedIncidentConfigurations(): IncidentConfigs {
    return this._savedIncidentConfigurations;
  }
  set savedIncidentConfigurations(configs: IncidentConfigs) {
    this._savedIncidentConfigurations = configs;
    this.savedIncidentConfigurationNames = Object.values(configs).map(config => config.name);
  }
  savedIncidentConfigurationNames: string[];
  get savedIncidentConfigurationsLen(): number {
    // returns the number of saved field configs
    return Object.keys(this.savedIncidentConfigurations).length;
  }
  loadedIncidentConfigName: string; // must clear when loaded from json or when current config is deleted
  loadedIncidentConfigId: string; // must clear when loaded from json or when current config is deleted

  // Delete dialog
  showDeleteDialog = false;
  selectedDeleteIncidentConfigs: string[] = [];

  // Open dialog
  showOpenDialog = false;
  selectedIncidentConfigIdToOpen = '';

  // Bulk create dialog
  showBulkCreateDialog = false;
  bulkCreateSelections: BulkCreateSelections;
  selectedBulkCreateIncidentConfig: string;
  bulkConfigurationsToPush: BulkCreateConfigurationToPush[] = [];

  // Bulk results dialog
  showBulkResultsDialog = false;
  bulkCreateResults: BulkCreateResult[] = [];
  bulkCreateIncidentJson: BulkCreateIncidentJSON; // stores the JSON structure of bulk-created incidents, for viewing and reference of the user

  // Select Demisto endpoint dialog
  showDemistoEndpointOpenDialog = false;
  selectedDemistoEndpointId: string;

  // New / edit Demisto endpoint dialog
  showNewDemistoEndpointDialog = false;
  newDemistoServerUrl = '';
  newDemistoServerApiKey = '';
  newDemistoServerTrustAny = true;
  newDemistoServerSaveDisabledError: string;
  editingDemistoServerId: string; // the server id of the endpoint that's being edited

  get newDemistoServerSaveDisabled() {
    this.newDemistoServerSaveDisabledError = undefined;

    const nameExists = this.demistoEndpointUrls.includes(this.newDemistoServerUrl);
    const nameExistsErrorMessage = 'This name is already taken';

    const urlError = this.newDemistoServerUrl.match(/^https?:\/\//) ? false : true;
    const urlErrorMessage = `The URL must start with 'https://' or 'http://'`;

    if (this.newDemistoServerDialogMode === 'new') {
      if (nameExists) {
        this.newDemistoServerSaveDisabledError = nameExistsErrorMessage;
        return true;
      }
      if (urlError) {
        this.newDemistoServerSaveDisabledError = urlErrorMessage;
        return true;
      }
      return false;
    }

    // edit mode
    if (urlError) {
      this.newDemistoServerSaveDisabledError = urlErrorMessage;
      return true;
    }

    const sameUrl = nameExists && this.demistoEndpoints[this.editingDemistoServerId].url === this.newDemistoServerUrl;
    if (!nameExists || sameUrl) {
      return false;
    }
    this.newDemistoServerSaveDisabledError = nameExistsErrorMessage;
    return true;
  }

  newDemistoServerDialogMode: DemistoServerEditMode = 'new';
  get newEditTestButtonDisabled(): boolean {
    if (this.newDemistoServerDialogMode === 'new') {
      return !this.newDemistoServerUrl || !this.newDemistoServerApiKey;
    }
    // edit mode
    return !this.newDemistoServerUrl;
  }

  // Delete Demisto endpoint dialog
  showDeleteDemistoEndpointDialog = false;
  demistoEndpointIdToDelete: string;

  loadDefaultChosenFields = false;

  // Json Mapping UI
  showJsonMappingUI = false;
  loadedJsonMappingConfigId: string; // must clear when a new config is created, when a config is opened, or when the current config is deleted

  // Import from Demisto dialog
  showLoadFromDemistoDialog = false;
  demistoIncidentIdToLoad = '';
  demistoEndpointToLoadFrom = '';
  get importFromDemistoAcceptDisabled(): boolean {
    return this.demistoEndpointToLoadFrom === '' || this.demistoIncidentIdToLoad.match(/^\d+$/) === null;
  }

  // fieldMappingSelection Box
  showFieldMappingSelectionBox = false;

  // Freeform JSON Configs
  _savedJsonConfigurations: JSONConfigRef[] = [];
  get savedJsonConfigurations(): JSONConfigRef[] {
    return this._savedJsonConfigurations;
  }
  set savedJsonConfigurations(value: JSONConfigRef[]) {
    this._savedJsonConfigurations = value;
    this.savedJsonConfigurationItems = value.map( val => ({value: val.id, label: val.name} as SelectItem));
    const savedJsonConfigurationsObj = {};
    for (const config of this._savedJsonConfigurations) {
      savedJsonConfigurationsObj[config.id] = config;
    }
    this.savedJsonConfigurationsObj = savedJsonConfigurationsObj;
    this.buildJsonFileAndGroupConfigurationsItems();
  }
  savedJsonConfigurationsObj: JSONConfigRefs = {};
  savedJsonConfigurationItems: SelectItem[];

  // JSON Groups Config & UI
  _jsonGroupConfigurations: JsonGroups = {};
  jsonGroupConfigurationsByName: JsonGroups = {};
  get jsonGroupConfigurations(): JsonGroups {
    return this._jsonGroupConfigurations;
  }
  set jsonGroupConfigurations(values: JsonGroups) {
    this._jsonGroupConfigurations = values;
    this.jsonGroupConfigurationsItems = Object.values(values).map( jsonConfig => ({
      value: jsonConfig.id,
      label: jsonConfig.name} as SelectItem) );
    const jsonGroupConfigurationsByName = {};
    for (const jsonGroup of Object.values(values)) {
      jsonGroupConfigurationsByName[jsonGroup.name] = jsonGroup;
    }
    this.jsonGroupConfigurationsByName = jsonGroupConfigurationsByName;
    this.buildJsonFileAndGroupConfigurationsItems();
  }
  showJsonGroupsDialog = false;
  jsonGroupConfigurationsItems: SelectItem[] = [];
  jsonFileAndGroupConfigurationsItems: SelectItem[] = [];
  // tslint:disable-next-line:variable-name
  jsonGroupDialog_jsonGroupSelection: string;
  showNewJsonConfigDialog = false;
  newJsonGroupConfigName: string;
  showJsonGroupDeleteDialog = false;
  jsonGroupDialogItems = {}; // temporary holder for group membership items in JSON Groups dialog
  // tslint:disable-next-line:variable-name
  jsonGroupDialog_jsonFileSelections = {}; // temporary holder for group membership selections in JSON Groups dialog
  get newJsonGroupAcceptButtonDisabled(): boolean {
    const jsonGroupNames = Object.values(this.jsonGroupConfigurations).map( jsonGroup => jsonGroup.name );
    return jsonGroupNames.includes(this.newJsonGroupConfigName);
  }

  // File Attachments Config & UI
  _fileAttachmentConfigs: FileAttachmentConfigs;
  fileAttachmentConfigItems: SelectItem[];
  fileAttachmentConfigsList: FileAttachmentConfig[];
  set fileAttachmentConfigs(configs: FileAttachmentConfigs) {
    this._fileAttachmentConfigs = configs;
    this.fileAttachmentConfigsList = Object.values(configs).map(value => value);
    this.fileAttachmentConfigItems = this.fileAttachmentConfigsList.map( value => ({
      label: value.filename, value: value.id
    }));
  }
  get fileAttachmentConfigs(): FileAttachmentConfigs {
    return this._fileAttachmentConfigs;
  }

  // File Attachments Dialog
  showFileAttachmentsDialog = false;
  selectedFileAttachment: string;
  fileAttachmentDisplayAsMediaItems: SelectItem[] = [
    {label: 'As file (recommended)', value: false},
    {label: 'As media (not secure)', value: true}
  ];

  // New Attachment Dialog
  showNewFileAttachmentDialog = false;
  uploadFileAttachmentAdded = false;
  newFileAttachmentName: string;
  newFileAttachmentComment: string;
  newFileAttachmentSize: number;
  newFileAttachmentType: string;
  newFileAttachmentDisplayAsMediaSelection = false;

  // Edit Attachment Dialog
  showEditFileAttachmentDialog = false;
  editFileAttachmentName: string;
  editFileAttachmentComment: string;
  editFileAttachmentSize: number;
  editFileAttachmentType: string;
  editFileAttachmentDisplayAsMediaSelection = false;

  // Incident Config Import
  showImportIncidentMappingDialog = false;
  duplicateIncidentMappingFromImport = false;
  overrideDuplicateIncidentMappingFromImport = false;
  incidentMappingSubmitButtonEnabled = false;
  validIncidentMappingFile = true;
  mappingToImport: IncidentConfig;

  // RxJS Subscriptions
  private subscriptions = new Subscription();



  async ngOnInit() {
    console.log('AppComponent: ngOnInit()');
    // Take Subscriptions
    this.subscriptions.add(this.fetcherService.fieldMappingSelectionActive.subscribe( () => this.onFieldMappingSelectionActive() ));

    this.subscriptions.add(this.fetcherService.fieldMappingSelectionEnded.subscribe( () => this.onFieldMappingSelectionEnded() ));

    this.subscriptions.add( this.fetcherService.fieldMappingSelectionReceived.subscribe( () => this.onFieldMappingSelectionEnded() ));

    // Get Logged In User
    try {
      this.loggedInUser = await this.fetcherService.getLoggedInUser();
      console.log('AppComponent: ngOnInit(): LoggedInUser:', this.loggedInUser);
    }
    catch (err) {
      console.log('AppComponent: ngOnInit(): Caught error fetching logged in user:', err);
    }

    // Encryption
    await this.fetcherService.initEncryption();

    // Demisto Endpoint Init
    await this.demistoEndpointInit(); // sets currentDemistoEndpointInit

    if (this.currentDemistoEndpointInit) {

      // Demisto Incident Fields
      try {
        await this.fetchIncidentFieldDefinitions(this.currentDemistoEndpointId);
      }
      catch (error) {
        console.error('AppComponent: ngOnInit(): Caught error fetching Demisto incident fields:', error);
      }

      // Demisto Incident Types
      try {
        this.fetchedIncidentTypes = await this.fetchIncidentTypes(this.currentDemistoEndpointId);
      }
      catch (error) {
        console.error('AppComponent: ngOnInit(): Caught error fetching Demisto incident types:', error);
      }
    }

    const initPromises = [];

    initPromises.push(this.getSavedIncidentConfigurations());

    initPromises.push(this.getSavedJsonConfigurations());

    initPromises.push(this.getSavedJsonGroupConfigurations());

    initPromises.push(this.getSavedFileAttachmentConfigurations());

    await Promise.all(initPromises);

    if (this.demistoEndpointsLen === 0) {
      // Don't move to ngAfterViewInit, as that won't wait for async calls to finish in ngOnInit before running
      setTimeout(() => this.onNewDemistoEndpointClicked(), 0);
    }

  }



  async getSavedJsonConfigurations() {
    try {
      this.savedJsonConfigurations = await this.fetcherService.getSavedJSONConfigurations();
      console.log('AppComponent: getSavedJsonConfigurations(): savedJsonConfigurations:', this.savedJsonConfigurations);
    }
    catch (error) {
      console.error('AppComponent: getSavedJsonConfigurations(): Caught error fetching Freeform JSON configurations:', error);
    }
  }



  async onFreeformJsonConfigurationsChanged() {
    console.log('AppComponent: onFreeformJsonConfigurationsChanged()');
    await this.getSavedIncidentConfigurations();
    await this.getSavedJsonConfigurations();
    await this.getSavedJsonGroupConfigurations();
  }



  async getSavedJsonGroupConfigurations() {
    console.log('AppComponent: getSavedJsonGroupConfigurations()');
    try {
      this.jsonGroupConfigurations = await this.fetcherService.getSavedJsonGroupConfigurations();
      console.log('AppComponent: getSavedJsonGroupConfigurations(): savedJsonConfigurations:', this.jsonGroupConfigurations);
    }
    catch (error) {
    console.error('AppComponent: getSavedJsonGroupConfigurations(): Caught error fetching JSON Groups configurations:', error);
    }
  }



  async getSavedFileAttachmentConfigurations() {
    try {
      this.fileAttachmentConfigs = await this.fetcherService.getFileAttachmentConfigs();
      console.log('AppComponent: getSavedFileAttachmentConfigurations(): fileAttachmentConfigs:', this.fileAttachmentConfigs);
    }
    catch (error) {
      console.error('AppComponent: getSavedFileAttachmentConfigurations(): Caught error fetching file attachment configurations:', error);
    }
  }



  messageAdd(message: PMessageOption) {
    this.messages.push(message);
  }



  messagesReplace(messages: PMessageOption[]) {
    this.messages = messages;
  }



  messageWithAutoClear(message: PMessageOption) {
    this.messages = [message];
    this.messagesClearTimeout = setTimeout( () => {
      this.messages = [];
      this.messagesClearTimeout = null;
    } , 5000 );
  }



  async demistoEndpointInit() {
    /*
      Loads the list of Demisto endpoint configs.
      Gets the default Demisto endpoint
      If there are no server configs, set currentDemistoEndpointInit = false and display a message and do nothing else
      If the server as serts that a default server is defined:
        Set defaultDemistoEndpointName
        Set currentDemistoEndpointName
        Test the current/default Demisto endpoint.
          If successful, display a success message
          If unsuccessful, display a failure message
        Finally, build the options for the server selection PrimeNG widget from our updated server list

      Called only from ngOnInit()
    */
    console.log('AppComponent: demistoEndpointInit()');
    try {

      const demistoEndpoints = await this.fetcherService.getDemistoEndpoints(); // obtain saved Demisto endpoints
      this.setDemistoEndpoints(demistoEndpoints);

      console.log('AppComponent: demistoEndpointInit(): demistoEndpoints:', demistoEndpoints);

      const defaultEndpointResult = await this.fetcherService.getDefaultDemistoEndpoint();
      console.log('AppComponent: demistoEndpointInit(): defaultEndpointResult:', defaultEndpointResult);

      const configsAreEmpty = Object.keys(demistoEndpoints).length === 0;
      const defaultDemistoEndpointDefinedButMissing = !configsAreEmpty && defaultEndpointResult.defined && !demistoEndpoints.hasOwnProperty(defaultEndpointResult.serverId);
      const defaultDemistoEndpointIsDefined = !configsAreEmpty && defaultEndpointResult.defined && demistoEndpoints.hasOwnProperty(defaultEndpointResult.serverId);

      this.currentDemistoEndpointInit = false;
      this.currentDemistoEndpointId = undefined;
      this.defaultDemistoEndpointId = undefined;

      if (configsAreEmpty) {
        this.messageWithAutoClear( { severity: 'info', summary: 'Info', detail: `No Demisto servers are defined.  Configure one below`} );
      }

      else if (defaultDemistoEndpointDefinedButMissing) {
        this.messageWithAutoClear( { severity: 'error', summary: 'Error', detail: `The default Demisto server id '${defaultEndpointResult.serverId}' is not defined.  This shouldn't happen.`} );
        }

      else if (defaultDemistoEndpointIsDefined) {
        this.defaultDemistoEndpointId = defaultEndpointResult.serverId;
        this.currentDemistoEndpointId = this.defaultDemistoEndpointId;

        const testRes = await this.fetcherService.testDemistoEndpointById(this.defaultDemistoEndpointId);

        this.currentDemistoEndpointInit = testRes.success;

        if (this.currentDemistoEndpointInit) {
          this.messageWithAutoClear( { severity: 'success', summary: 'Success', detail: `Communication to XSOAR endpoint ${demistoEndpoints[this.currentDemistoEndpointId].url} is initialised`});
        }
        else {
          this.messageWithAutoClear( { severity: 'error', summary: 'Failure', detail: `Communication to XSOAR endpoint ${demistoEndpoints[this.currentDemistoEndpointId].url} is not initialised`} );
        }
      }
    }

    catch (err) {
      console.log('AppComponent: demistoEndpointInit(): Caught error fetching Demisto endpoint status:', err);
    }
    this.buildDemistoEndpointItems();
  }



  setDemistoEndpoints(demistoEndpoints: DemistoEndpoints) {
    console.log('AppComponent: buildDemistoEndpointItems()');
    this.demistoEndpoints = demistoEndpoints;
    this.demistoEndpointUrls = Object.values(demistoEndpoints).map( endpoint => endpoint.url);
    this.demistoEndpointsLen = Object.keys(demistoEndpoints).length;
  }



  buildDemistoEndpointItems() {
    console.log('AppComponent: buildDemistoEndpointItems()');
    this.demistoEndpointsItems = Object.values(this.demistoEndpoints).map( demistoEndpoint => (
      {
        value: demistoEndpoint.id,
        label: this.defaultDemistoEndpointId && demistoEndpoint.id === this.defaultDemistoEndpointId ? `${demistoEndpoint.url} (default)` : demistoEndpoint.url
      }
    ) );
    console.log('AppComponent: buildDemistoEndpointItems(): demistoEndpointsItems:', this.demistoEndpointsItems);
  }



  async refreshDemistoEndpoints(setDefault = false) {
    /*
      Called from onNewDemistoEndpointSaved(), onDeleteDemistoEndpointConfirmed(), onSetDefaultDemistoEndpoint(), onRefreshDemistoEndpoints(), and onDemistoEndpointUpdated()

      Loads the list of Demisto endpoint configs.
      Gets the default Demisto endpoint, as it may have changed.
      If there are no configs, set currentDemistoEndpointInit = false and currentDemistoEndpointName = undefined
      If the server says the default Demisto endpoint is defined, set defaultDemistoEndpointName to be the default Demisto endpoint
      if the current server no longer exists after the refresh, then set currentDemistoEndpointName to undefined
      If a server is selected (currentDemistoEndpointName), test it and save result to currentDemistoEndpointInit
      Finally, build the options for the server selection PrimeNG widget from our updated server list

      setDefault = true means that defaultDemistoEndpointName should be set automatically if this is the first server to be added, typically only upon a create or delete operation.  Only used when called from onNewDemistoEndpointSaved()
    */

    console.log('AppComponent: refreshDemistoEndpoints()');
    const lastDemistoEndpointsLen = this.demistoEndpointsLen;
    const lastCurrentDemistoEndpointName = this.currentDemistoEndpointId;

    const demistoEndpoints = await this.fetcherService.getDemistoEndpoints(); // obtain saved Demisto endpoints
    this.setDemistoEndpoints(demistoEndpoints);

    // console.log('AppComponent: refreshDemistoEndpoints(): demistoEndpoints:', this.demistoEndpoints);

    const firstDefinedServer = setDefault && lastDemistoEndpointsLen === 0 && this.demistoEndpointsLen !== 0;

    if (firstDefinedServer) {
      // if no endpoints were previously defined, make the first endpoint to be added, the default
      const firstServerId = Object.keys(this.demistoEndpoints)[0];
      await this.fetcherService.setDefaultDemistoEndpoint(firstServerId);
      this.switchCurrentDemistoEndpoint(firstServerId);
    }

    // Gets the default Demisto endpoint, as it may have changed.
    const defaultEndpointResult = await this.fetcherService.getDefaultDemistoEndpoint();

    const configsAreEmpty = this.demistoEndpointsLen === 0;

    const defaultDemistoEndpointIsDefined = !configsAreEmpty && defaultEndpointResult.defined && defaultEndpointResult.serverId in this.demistoEndpoints;

    if (configsAreEmpty) {
      this.currentDemistoEndpointInit = false;
      this.currentDemistoEndpointId = undefined;
    }
    else if (defaultDemistoEndpointIsDefined) {
      this.defaultDemistoEndpointId = defaultEndpointResult.serverId;
    }

    const currentEndpointStillDefined = this.currentDemistoEndpointId && this.currentDemistoEndpointId in this.demistoEndpoints; // make sure the currently selected Demisto endpoint hasn't been deleted

    if (!currentEndpointStillDefined) {
      // clear selected endpoint
      this.currentDemistoEndpointId = undefined;
    }

    if (this.currentDemistoEndpointId) {
      // test the currently selected server
      let testRes = await this.fetcherService.testDemistoEndpointById(this.currentDemistoEndpointId);

      this.currentDemistoEndpointInit = testRes.success;
    }
    this.buildDemistoEndpointItems();
  }



  async testDemistoEndpointAdHoc(url: string, apiKey: string, trustAny: boolean): Promise<boolean> {
    // performs an ad hoc test of a Demisto endpoint
    console.log('AppComponent: testDemistoEndpointAdHoc()');
    let testResult: string;
    const useServerId = this.newDemistoServerDialogMode === 'edit' && this.newDemistoServerApiKey === '';
    try {
      let result;
      if (!useServerId) {
        result = await this.fetcherService.testDemistoEndpointAdhoc({url, apiKey, trustAny});
      }
      else {
        result = await this.fetcherService.testDemistoEndpointAdhoc({url, trustAny, id: this.selectedDemistoEndpointId});
      }
      if (this.messagesClearTimeout) {
        clearTimeout(this.messagesClearTimeout);
        this.messagesClearTimeout = null;
      }
      console.log('AppComponent: testCredentials() result:', result);
      if ( 'success' in result && result.success ) {
        // test successful
        testResult = 'Test successful';
        this.messageWithAutoClear({ severity: 'success', summary: 'Success', detail: 'XSOAR endpoint communication test success'});
        return true;
      }
      else if ( 'success' in result && !result.success ) {
        // test unsuccessful
        let err = 'error' in result ? result.error : 'Unspecified error';
        if ('statusCode' in result) {
          testResult = `Test failed with code ${result.statusCode}: "${err}"`;
        }
        else {
          testResult = `Test failed with error: "${err}"`;
        }
        this.messages = [{
          severity: 'error',
          summary: 'Failure',
          detail: `XSOAR endpoint communication is not initialised. ${testResult}`
        }];
        return false;
      }
    }
    catch (error) {
      testResult = `Test failed with error: ${error.message || error}`;
      this.messages = [{
        severity: 'error',
        summary: 'Failure',
        detail: `XSOAR endpoint communication is not initialised. ${testResult}`
      }];
      return false;
    }
  }



  async fetchIncidentFieldDefinitions(serverId): Promise<boolean> {
    /*
      Called from ngOnInit(), onReloadFieldDefinitions(), refreshDemistoEndpoints(), switchCurrentDemistoEndpoint()
      Fetches incident field definitions from Demisto
      Saves them to fetchedIncidentFieldDefinitions
    */
    console.log('AppComponent: fetchIncidentFieldDefinitions()');
    try {
      const fetchedIncidentFieldDefinitions: FetchedIncidentField[] = await this.fetcherService.getIncidentFieldDefinitions(serverId);

      this.fetchedIncidentFieldDefinitions = this.parseFetchedIncidentFieldDefinitions(fetchedIncidentFieldDefinitions);

      console.log('AppComponent: fetchedIncidentFieldDefinitions:', this.fetchedIncidentFieldDefinitions);
      return true;
    }
    catch (err) {
      console.log('AppComponent: fetchIncidentFieldDefinitions(): Caught error fetching Demisto incident fields:', err);
      return false;
    }
  }



  parseFetchedIncidentFieldDefinitions(fetchedIncidentFieldDefinitions: FetchedIncidentField[]): FetchedIncidentFieldDefinitions {
    let tmpFields: FetchedIncidentFieldDefinitions = {};
    fetchedIncidentFieldDefinitions.forEach( (field: FetchedIncidentField) => {
      const shortName = field.cliName;
      tmpFields[shortName] = field;
    });
    return tmpFields;
  }



  async fetchIncidentTypes(serverId): Promise<FetchedIncidentType[]> {
    /*
      Called from ngOnInit(), onBulkCreateIncidentsAccepted()
      Fetches incident types from Demisto
    */
    // console.log('AppComponent: fetchIncidentTypes()');
    const fetchedIncidentTypes: FetchedIncidentType[] = await this.fetcherService.getIncidentTypes(serverId);
    console.log('AppComponent: fetchIncidentTypes():', fetchedIncidentTypes);
    return fetchedIncidentTypes;
  }



  onIncidentJsonUploaded(data: { files: File }, uploadRef) {
    let file = data.files[0];
    console.log('AppComponent: onIncidentJsonUploaded(): file:', file);

    let reader = new FileReader();

    reader.onloadend = (progressEvent: ProgressEvent) => {
      try {
        const parsedIncidentJson = JSON.parse(reader.result as string);
        console.log('AppComponent: onIncidentJsonUploaded(): parsedIncidentJson:', parsedIncidentJson);
        this.showJsonMappingUI = true;
        this.loadDefaultChosenFields = false;
        this.loadedIncidentConfigId = undefined;
        this.loadedIncidentConfigName = undefined;
        this.changeDetector.detectChanges();
        this.freeformJsonUIComponent.onUploadIncidentJson(parsedIncidentJson);
      }
      catch (error) {
        console.error('onIncidentJsonUploaded(): Error parsing uploaded JSON:', error);
      }
      uploadRef.clear(); // allow future uploads
    };

    reader.readAsText(data.files[0]); // kick off the read operation (calls reader.onloadend())
  }



  onIncidentConfigOpened(config?: IncidentConfig) {
    console.log('AppComponent: onIncidentConfigOpened()');
    this.showOpenDialog = false;
    this.showJsonMappingUI = true;
    this.loadDefaultChosenFields = false;
    this.changeDetector.detectChanges();

    const selectedConfig = config ? config : this.savedIncidentConfigurations[this.selectedIncidentConfigIdToOpen];
    this.loadedIncidentConfigId = selectedConfig.id;
    this.loadedIncidentConfigName = selectedConfig.name;
    this.freeformJsonUIComponent.onIncidentConfigOpened(selectedConfig);
    this.selectedIncidentConfigIdToOpen = ''; // reset selection
  }



  onDeleteIncidentConfigClicked() {
    console.log('AppComponent: onDeleteIncidentConfigClicked()');
    this.showDeleteDialog = true;
    this.selectedDeleteIncidentConfigs = [];
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      (document.getElementsByClassName('deleteConfigDialog')[0].getElementsByClassName('ui-inputtext')[1] as HTMLInputElement).focus();
    }, 200);
  }



  onDeleteIncidentConfigCancelled() {
    console.log('AppComponent: onDeleteIncidentConfigCancelled()');
    this.showDeleteDialog = false;
  }



  onDeleteDemistoEndpointHidden() {
    this.showDemistoEndpointOpenDialog = true;
  }



  onDeleteIncidentConfigAccepted() {
    console.log('AppComponent: onDeleteIncidentConfigAccepted()');
    this.showDeleteDialog = false;
    let activeConfig = false;
    const configNames = this.selectedDeleteIncidentConfigs.map( incidentId => this.savedIncidentConfigurations[incidentId].name);
    let message = `Are you sure that you would like to delete the configuration${utils.sPlural(configNames)}: ${configNames.join(', ')} ?`;
    if (this.selectedDeleteIncidentConfigs.includes(this.loadedIncidentConfigId) ) {
      activeConfig = true;
      message = `Are you sure you want to delete the ACTIVE configuration '${this.loadedIncidentConfigName}' ?`;
    }
    this.confirmationService.confirm( {
      header: `Confirm Deletion`,
      message,
      accept: () => this.onDeleteIncidentConfigConfirmed(activeConfig),
      icon: 'pi pi-exclamation-triangle'
    });
  }



  async onDeleteIncidentConfigConfirmed(activeConfig: boolean) {
    console.log('AppComponent: onDeleteIncidentConfigConfirmed()');

    const selectedDeleteConfigNames: string[] = [];

    this.selectedDeleteIncidentConfigs.forEach( async configId => {
      selectedDeleteConfigNames.push(this.savedIncidentConfigurations[configId].name);
      try {
        await this.fetcherService.deleteIncidentConfiguration(configId);
      }
      catch (error) {
        console.error(`onDeleteIncidentConfigConfirmed(): caught error whilst deleting configuration ${configId}`);
        return;
      }
    });

    if (activeConfig) {
      this.loadedIncidentConfigId = undefined;
      this.loadedIncidentConfigName = undefined;
    }

    // fetch incident configs
    await this.getSavedIncidentConfigurations();
    this.messageWithAutoClear({severity: 'success', summary: 'Successful', detail: `Configuration${utils.sPlural(selectedDeleteConfigNames)} ${selectedDeleteConfigNames.join(', ')} was successfully deleted`});

    this.selectedDeleteIncidentConfigs = []; // reset selection
  }



  onOpenClicked() {
    console.log('AppComponent: onOpenClicked()');
    this.showOpenDialog = true;
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      (document.getElementsByClassName('openDialog')[0].getElementsByClassName('ui-inputtext')[1] as HTMLInputElement).focus();
    }, 200);
  }



  onOpenCancelled() {
    console.log('AppComponent: onOpenCancelled()');
    this.showOpenDialog = false;
  }



  jmesPathResolve(path, json: object) {
    console.log('AppComponent: jmesPathResolve()');
    if (path === '' || path.match(/^\s+$/)) {
      return null;
    }
    try {
      const res = jmespath.search(json, path);
      // console.log('res:', res);
      return res;
    }
    catch (error) {
      console.log('JMESPath.search error:', 'message' in error ? error.message : error);
    }
  }



  transformDate(value: number | string, dateConfig: DateConfig): string {
    // console.log('AppComponent: transformDate(): resolvedValue:', this.resolvedValue);

    if (!value || value === '') {
      return;
    }

    let valueType = typeof value;

    let moment: dayjs.Dayjs;

    if (valueType === 'number') {
      moment = dateConfig.precision === 1 ? dayjs.unix(value as number).utc() : dayjs(value as number / dateConfig.precision * 1000).utc();
    }

    else if (valueType === 'string') {
      moment = dateConfig.autoParse ? dayjs(value) : dayjs(value, dateConfig.formatter);
    }

    const valid = moment.isValid();

    if (valid && dateConfig.utcOffsetEnabled) {
      moment = moment.add(dateConfig.utcOffset, 'hour');
    }

    return moment.toISOString();
  }



  getValidBulkConfigurations(): BulkCreateSelections {
    const validConfigs: BulkCreateSelections = {};
    for (const incidentConfigId of Object.keys(this.bulkCreateSelections)) {
      const bulkCreateSelection: BulkCreateSelection = this.bulkCreateSelections[incidentConfigId];
      const [jsonGroupIds, jsonFileIds] = this.reduceBulkConfigurationJSONConfigsAndGroups(bulkCreateSelection);

      const jsonGroupsGood = jsonGroupIds && jsonGroupIds.length !== 0;
      const jsonFilesGood = jsonFileIds && jsonFileIds.length !== 0;
      const endpointsGood = bulkCreateSelection.endpoints.length !== 0;
      const jsonRequired = this.savedIncidentConfigurations[incidentConfigId].requiresJson;

      if ((jsonGroupsGood || jsonFilesGood) && endpointsGood && jsonRequired) {
        validConfigs[incidentConfigId] = bulkCreateSelection;
      }
      else if (endpointsGood && !jsonRequired) {
        validConfigs[incidentConfigId] = bulkCreateSelection;
      }
    }
    return validConfigs;
  }



  reduceBulkConfigurationServersToTest(bulkSelections: BulkCreateSelections): string[] {
    const serversToTest = Object.keys(bulkSelections).reduce( (result, incidentConfigId) => {
      const bulkCreateSelection: BulkCreateSelection = this.bulkCreateSelections[incidentConfigId];

      for (const serverId of bulkCreateSelection.endpoints) {
        if (!result.includes(serverId)) {
          result.push(serverId);
        }
      }

      return result;
    }, [] );

    return serversToTest;
  }



  getAllJsonFilesForBulkConfiguration(bulkSelection: BulkCreateSelection): BulkCreateSelection {
    const [jsonGroupIds, jsonFileIds] = this.reduceBulkConfigurationJSONConfigsAndGroups(bulkSelection);
    for (const jsonGroupId of jsonGroupIds) {
      const jsonFileIdsForGroup = this.jsonGroupConfigurations[jsonGroupId].jsonFileIds;
      for (const jsonFileId of jsonFileIdsForGroup) {
        if (!jsonFileIds.includes(jsonFileId)) {
          jsonFileIds.push(jsonFileId);
        }
      }
    }
    bulkSelection.jsonFileIds = jsonFileIds;
    return bulkSelection;
  }



  reduceBulkConfigurationServersToGood(bulkSelections: BulkCreateSelections, successfulServerIds: string[]): BulkCreateSelections {
    // runs the endpoints of a BulkCreateSelections through an array of endpoints that have tested successully, and returns the sanitised result

    for (let bulkSelection of Object.values(bulkSelections)) {
      const successfulEndpoints = [];
      const failedEndpoints = [];
      for (const serverId of bulkSelection.endpoints) {
        successfulServerIds.includes(serverId) ? successfulEndpoints.push(serverId) : failedEndpoints.push(serverId);
      }
      bulkSelection.successfulEndpoints = successfulEndpoints;
      bulkSelection.failedEndpoints = failedEndpoints;

      // add jsonFiles property to bulkSelection
      this.getAllJsonFilesForBulkConfiguration(bulkSelection); // modifies the original bulkSelections object, so there is no assignment operator here
    }
    return bulkSelections;
  }



  reduceBulkConfigurationJsonFilesToFetch(bulkCreateSelections: BulkCreateSelections): string[] {
    // can reduce all bulkSelectionConfigs to a single list of JSON files to fetch, or just a single bulkSelection

    function loopOverJsonFiles(jsonFileIds: string[], result) {
      for (const jsonFileId of jsonFileIds) {
        if (!result.includes(jsonFileId)) {
          result.push(jsonFileId);
        }
      }
      return result;
    }

    const loopOverJsonGroups = (jsonGroupIds: string[], result) => {
      for (const jsonGroupId of jsonGroupIds) {
        // lookup the group
        const jsonFileIds = this.jsonGroupConfigurations[jsonGroupId].jsonFileIds;
        for (const jsonFileId of jsonFileIds) {
          if (!result.includes(jsonFileId)) {
            result.push(jsonFileId);
          }
        }
      }
      return result;
    };

    const fileIdsToFetch = Object.keys(bulkCreateSelections).reduce( (result, incidentConfigName) => {
      const bulkCreateSelection: BulkCreateSelection = bulkCreateSelections[incidentConfigName];

      const [jsonGroupIds, jsonFileIds] = this.reduceBulkConfigurationJSONConfigsAndGroups(bulkCreateSelection);

      if (jsonGroupIds && jsonGroupIds.length !== 0) {
        result = loopOverJsonGroups(jsonGroupIds, result);
      }

      if (jsonFileIds && jsonFileIds.length !== 0) {
        result = loopOverJsonFiles(jsonFileIds, result);
      }

      return result;
    }, []);

    return fileIdsToFetch;
  }



  reduceBulkConfigurationJSONConfigsAndGroups(bulkCreateSelection: BulkCreateSelection): [string[], string[]] {
    // separates bulkCreateSelection.jsonSelections (which contains both json group id's and json file id's), into discrete jsonGroupIds and jsonFileIds arrays
    const jsonGroupIds = bulkCreateSelection.jsonSelections.reduce( (result, value: string) => {
      const type = value.slice(0, 2); // 'g_' for json group or 'j_' for json file
      if (type === 'g_') {
        result.push(value.slice(2));
      }
      return result;
    }, []);
    // console.log('AppComponent: reduceBulkConfigurationJSONConfigsOrGroups(): jsonGroups:', jsonGroups);

    const jsonFileIds = bulkCreateSelection.jsonSelections.reduce( (result, value: string) => {
      const type = value.slice(0, 2); // 'g_' for json group or 'j_' for json file
      if (type === 'j_') {
        result.push(value.slice(2));
      }
      return result;
    }, []);
    // console.log('AppComponent: reduceBulkConfigurationJSONConfigsOrGroups(): jsonFiles:', jsonFiles);

    return [jsonGroupIds, jsonFileIds];
  }



  buildBulkConfigurationsToPushItems() {
    // console.log('AppComponent: buildBulkConfigurationsToPushItems()');
    const bulkConfigurationsToPush: BulkCreateConfigurationToPush[] = [];

    for (const incidentConfigId of Object.keys(this.bulkCreateSelections).sort(utils.sortArrayNaturally)) {
      const bulkCreateSelection = this.bulkCreateSelections[incidentConfigId];

      const [jsonGroupIds, jsonFileIds] = this.reduceBulkConfigurationJSONConfigsAndGroups(bulkCreateSelection);

      const jsonGroupNames = jsonGroupIds.map( groupId => this.jsonGroupConfigurations[groupId].name);
      const jsonFileNames = jsonFileIds.map (fileId => this.savedJsonConfigurationsObj[fileId].name);

      const jsonGroupsGood = jsonGroupIds && jsonGroupIds.length !== 0;
      const jsonFilesGood = jsonFileIds && jsonFileIds.length !== 0;
      const endpointsGood = bulkCreateSelection.endpoints.length !== 0;
      const jsonRequired = this.savedIncidentConfigurations[incidentConfigId].requiresJson;

      const bulkConfigToPush: BulkCreateConfigurationToPush = {
        incidentConfigId,
        endpoints: bulkCreateSelection.endpoints.join(', ')
      };


      if ((jsonGroupsGood || jsonFilesGood) && endpointsGood && jsonRequired) {
        if (jsonGroupsGood) {
          bulkConfigToPush.jsonGroupIds = jsonGroupIds.join(', ');
          bulkConfigToPush.jsonGroupNames = jsonGroupNames.join(', ');
        }
        if (jsonFilesGood) {
          bulkConfigToPush.jsonFileIds = jsonFileIds.join(', ');
          bulkConfigToPush.jsonFileNames = jsonFileNames.join(', ');
        }
        bulkConfigurationsToPush.push(bulkConfigToPush);
      }
      else if (endpointsGood && !jsonRequired) {
        bulkConfigurationsToPush.push(bulkConfigToPush);
      }

    }
    // console.log('AppComponent: buildBulkConfigurationsToPushItems(): bulkConfigurationsToPush:', bulkConfigurationsToPush);
    this.bulkConfigurationsToPush = bulkConfigurationsToPush;
  }



  buildBulkCreateGroups() {
    console.log('AppComponent: buildBulkCreateGroups()');
    // console.log('AppComponent: buildBulkCreateGroups(): jsonGroupConfigurationsItems:', this.jsonGroupConfigurationsItems);

    const selections: BulkCreateSelections = {};
    for (const incidentConfig of Object.values(this.savedIncidentConfigItems)) {
      const incidentConfigId = incidentConfig.value;
      selections[incidentConfigId] = {
        jsonSelections: [],
        endpoints: []
      };
    }
    this.bulkCreateSelections = selections;
  }



  onBulkCreateClicked() {
    console.log('AppComponent: onBulkCreateClicked()');
    this.showBulkCreateDialog = true;
    this.buildBulkCreateGroups();
    this.bulkConfigurationsToPush = undefined;
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      (document.getElementsByClassName('bulkCreateDialog')[0].getElementsByClassName('ui-inputtext')[1] as HTMLInputElement).focus();
    }, 200);
  }



  onBulkCreateCancelled() {
    console.log('AppComponent: onBulkCreateCancelled()');
    this.showBulkCreateDialog = false;
  }



  async bulkCreateServerTests(serversToTest: string[]): Promise<BulkCreateServerTestResults> {
    const testResults: DemistoEndpointTestResults = {};
    const successfulServerIds = [];
    const serverIncidentTypes: EndpointIncidentTypes = {}; //  holds incident type configs for servers, fetched from Demisto, indexed by serverId
    const serverIncidentTypeNames: EndpointIncidentTypeNames = {};
    const serverFieldDefinitions: BulkCreateFetchedIncidentFields = {};

    const serverTestPromises: Promise<any>[] = serversToTest.map( async serverId => {
      console.log(`AppComponent: bulkCreateServerTests(): Testing Demisto server ${serverId}`);
      const testResult: DemistoEndpointTestResult = await this.fetcherService.testDemistoEndpointById(serverId);

      testResults[serverId] = testResult;

      if (testResult.success) {
        successfulServerIds.push(serverId);

        // Fetch incident types
        console.log(`AppComponent: bulkCreateServerTests(): Fetching incident types from XSOAR server ${serverId}`);
        const incidentTypesPromise = this.fetchIncidentTypes(serverId).then( incidentTypes => {
          console.log(`AppComponent: bulkCreateServerTests(): got incident types`);
          serverIncidentTypes[serverId] = incidentTypes;
          serverIncidentTypeNames[serverId] = incidentTypes.map( incidentType => incidentType.name );
        });

        // Fetch field definitions
        console.log(`AppComponent: bulkCreateServerTests(): Fetching field definitions from XSOAR server ${serverId}`);
        const fieldsPromise = this.fetcherService.getIncidentFieldDefinitions(serverId).then( fetchedIncidentFieldDefinitions => {
          console.log(`AppComponent: bulkCreateServerTests(): got incident field definitions`);
          serverFieldDefinitions[serverId] = this.parseFetchedIncidentFieldDefinitions(fetchedIncidentFieldDefinitions);
        });

        const endpointPromises: Promise<any>[] = [incidentTypesPromise, fieldsPromise];

        // Wait for incident types and field definitions to return
        await Promise.all(endpointPromises);
      }
    } );

    // wait for server tests to finish
    await Promise.all(serverTestPromises);


    return { testResults, successfulServerIds, serverIncidentTypes, serverIncidentTypeNames, serverFieldDefinitions };
  }



  async bulkCreateRetrieveJsonFiles(jsonFileIdsToFetch): Promise<BulkCreateRetrieveJSONFilesResults> {
    const jsonFileIds: JsonFileIds = {};

    const jsonFetchPromises = jsonFileIdsToFetch.map( async jsonFileId => {
      jsonFileIds[jsonFileId] = await this.fetcherService.getSavedJSONConfiguration(jsonFileId);
    });
    const jsonFilesFetchSuccessful = jsonFetchPromises.length !== 0;
    // wait for JSON retrieve tests to finish
    await Promise.all(jsonFetchPromises);
    return {jsonFileIds, jsonFilesFetchSuccessful};
  }



  async bulkCreateWorkLoop(validBulkConfigurations, testResults, serverIncidentTypeNames, jsonFileIds, serverFieldDefinitions): Promise<BulkCreateIncidentJSON> {

    const createIncidentPromises: Promise<any>[] = [];
    const bulkCreateIncidentJson: BulkCreateIncidentJSON = {};

    for (const configId of Object.keys(validBulkConfigurations)) {

      const validBulkCreateConfig = validBulkConfigurations[configId];

      // Loop through the bad endpoints of the bulk config
      for (const serverId of validBulkCreateConfig.failedEndpoints) {
        // Push the error to results, and continue to the next loop iteration / server
        const testResult = testResults[serverId];
        let error;
        if ('statusCode' in testResult) {
          error = `Server test failed with status code ${testResult.statusCode}: ${testResult.error}`;
        }
        else {
          error = `Server test failed with error: ${testResult.error}`;
        }
        this.bulkCreateResults.push({configId, serverId, success: false, error});
        this.changeDetector.detectChanges(); // update UI
      }

      // Take no further action for this bulk config if there were no successful endpoints
      if (validBulkCreateConfig.successfulEndpoints.length === 0) {
        continue;
      }


      // Work loop to build and push incidents to XSOAR
      for (const serverId of validBulkCreateConfig.successfulEndpoints) {
        // Loop through the successfully-tested endpoints

        console.log('AppComponent: bulkCreateWorkLoop(): configId:', configId);
        console.log('AppComponent: bulkCreateWorkLoop(): config name:', this.savedIncidentConfigurations[configId].name );

        const incidentConfig = this.savedIncidentConfigurations[configId];

        const skippedFields: string[] = [];
        const hasAnEnabledAttachmentField = utils.fieldsHaveEnabledAttachmentField(Object.values(incidentConfig.chosenFields) as IncidentFieldUI[]);

        // Skip this server if the incident type isn't defined
        console.log('AppComponent: bulkCreateWorkLoop(): serverIncidentTypeNames:', serverIncidentTypeNames);
        console.log('AppComponent: bulkCreateWorkLoop(): serverIncidentTypeNames[serverId]:', serverIncidentTypeNames[serverId]);
        let incidentTypeFieldDefined = serverIncidentTypeNames[serverId].includes(incidentConfig.incidentType) ? true : false;
        if (!incidentTypeFieldDefined) {
          const error = `Incident type '${incidentConfig.incidentType}' is not defined on XSOAR server`;
          this.bulkCreateResults.push({configId, serverId, success: false, error});
          this.changeDetector.detectChanges(); // update UI
          continue;
        }


        const buildIncidentConfig = (jsonFile = undefined) => {
          // Function to build the incident json and push to XSOAR

          const filesToPush: FileToPush[] = [];

          const newIncident: IncidentCreationConfig = {
            serverId,
            createInvestigation: hasAnEnabledAttachmentField ? false : incidentConfig.createInvestigation
          };

          const json = jsonFile ? jsonFileIds[jsonFile] : undefined;

          Object.values(incidentConfig.chosenFields).forEach( field => {
            // Loop through the chosen fields of the incident

            const isAttachmentField = field.shortName === 'attachment' || field.fieldType === 'attachments';
            const hasAttachments = isAttachmentField && utils.isArray(field.attachmentConfig) && field.attachmentConfig.length !== 0;

            const fieldName = field.shortName;
            if (!field.enabled) {
              // silently skip non-enabled fields
              return;
            }

            if (!(fieldName in serverFieldDefinitions[serverId])) {
              // skip fields which don't exist in XSOAR config
              skippedFields.push(fieldName);
              return;
            }

            let value;

            if (isAttachmentField) {

              if (!hasAttachments) {
                return;
              }

              // Push attachments into array of attachments to be uploaded to the incident after initial incident creation
              for (const attachment of field.attachmentConfig) {
                const originalAttachment: FileAttachmentConfig = this.fileAttachmentConfigs[attachment.id];
                const isMediaFile = utils.isUIAttachmentMediaFile(originalAttachment);

                const fileToPush: FileToPush = {
                  attachmentId: attachment.id,
                  incidentFieldName: field.shortName,
                  serverId,
                  filename: 'filenameOverride' in attachment ? attachment.filenameOverride : originalAttachment.filename,
                  last: false // will set the last value later
                };

                if (isMediaFile) {
                  fileToPush.mediaFile = 'mediaFileOverride' in attachment ? attachment.mediaFileOverride : originalAttachment.mediaFile;
                }

                if ('commentOverride' in attachment) {
                  fileToPush.comment = attachment.commentOverride;
                }

                else if (originalAttachment.comment !== '') {
                  fileToPush.comment = originalAttachment.comment;
                }

                filesToPush.push(fileToPush);
              }
            }

            else if (field.mappingMethod === 'static') {
              // static field
              value = field.value;
            }

            else if (field.mappingMethod === 'jmespath') {
              value = this.jmesPathResolve(field.jmesPath, json);
              value = utils.massageData(value, field.fieldType);

              const unpermittedValue = value === null && !field.permitNullValue;
              const nullDate = field.fieldType === 'date' && value === null;

              if (unpermittedValue || nullDate) {
                return;
              }

              if (field.fieldType === 'date') {
                value = this.transformDate(value, field.dateConfig);
                if (value === null) {
                  return;
                }
              }
            }

            if (!('CustomFields' in newIncident)) {
              newIncident.CustomFields = {};
            }
            field.custom ? newIncident.CustomFields[fieldName] = value : newIncident[fieldName] = value; // write value to config
          });
          // Finished building incident



          if (filesToPush.length !== 0)  {
            // Causes the playbook to run after the last file has been uploaded, if the user wants to create an investigation
            filesToPush[filesToPush.length - 1].last = true;
          }

          console.log('AppComponent: bulkCreateWorkLoop(): newIncident:', newIncident);
          console.log('AppComponent: bulkCreateWorkLoop(): filesToPush:', filesToPush);



          // Submit the incident to XSOAR
          createIncidentPromises.push((async () => {
            const res = await this.fetcherService.createDemistoIncident(newIncident);

            if (res.success) {
              const incidentId = res.id;

              if (filesToPush.length !== 0) {
                // now upload files to XSOAR
                for (const fileToPush of filesToPush) {
                  fileToPush.incidentId = incidentId;
                  let result;
                  try {
                    result = await this.fetcherService.uploadFileToDemistoIncident(fileToPush);
                    console.log('AppComponent: bulkCreateWorkLoop(): attachment upload result:', result);
                  }
                  catch (error) {
                    console.log('AppComponent: bulkCreateWorkLoop(): attachment upload result:', result);
                    console.error('AppComponent: bulkCreateWorkLoop(): Caught error when uploading attachment. error:', error);
                  }
                }
              }

              jsonFile = jsonFile ? jsonFile : undefined;
              if (!(serverId in bulkCreateIncidentJson)) {
                bulkCreateIncidentJson[serverId] = {};
              }
              bulkCreateIncidentJson[serverId][incidentId] = newIncident;
              this.bulkCreateResults.push({configId, serverId, success: true, skippedFields, incidentId, jsonFile});
            }

            else {
              // incident creation unsuccessful
              const error = res.statusMessage;
              this.bulkCreateResults.push({configId, serverId, success: false, error});
            }
            this.changeDetector.detectChanges(); // update UI
          })());
        };

        // Now build the incident(s)
        if (incidentConfig.requiresJson) {
          for (const jsonFile of validBulkCreateConfig.jsonFileIds) {
            buildIncidentConfig(jsonFile);
          }
        }

        else {
          buildIncidentConfig();
        }

      }
    }

    // Wait for all incidents to be created
    await Promise.all(createIncidentPromises);

    console.log('AppComponent: bulkCreateWorkLoop(): bulkCreateResults:', this.bulkCreateResults);

    return bulkCreateIncidentJson;
  }



  async onBulkCreateIncidentsAccepted() {
    console.log('AppComponent: onBulkCreateIncidentsAccepted()');

    console.log('AppComponent: onBulkCreateIncidentsAccepted(): bulkCreateSelections:', this.bulkCreateSelections);

    this.showBulkCreateDialog = false;
    this.showBulkResultsDialog = true;
    this.changeDetector.detectChanges(); // trigger change detection

    this.bulkCreateResults = [];

    /*
    Steps to complete:

    1.  Load incident config
    2.  Test server
    3.  Load server fields
    4.  Load server incident types
    5.  Check whether incident requires JSON file
    6.  Load JSON file, if needed
    7.  Check for keys that can't be pushed
    8.  Display them in a column
    9.  Push case with all other fields
    10.  Display results in a column
    */

    let validBulkConfigurations: BulkCreateSelections = this.getValidBulkConfigurations();
    console.log('AppComponent: onBulkCreateIncidentsAccepted(): validBulkConfigurations:', validBulkConfigurations);

    // get a list of servers to test
    const serversToTest = this.reduceBulkConfigurationServersToTest(validBulkConfigurations);
    console.log('AppComponent: onBulkCreateIncidentsAccepted(): serversToTest:', serversToTest);

    // run server tests
    const { testResults, successfulServerIds, serverIncidentTypes, serverIncidentTypeNames, serverFieldDefinitions } = await this.bulkCreateServerTests(serversToTest);

    // log results
    console.log('AppComponent: onBulkCreateIncidentsAccepted(): Server tests and field fetching complete');
    console.log('AppComponent: onBulkCreateIncidentsAccepted(): testResults:', testResults);
    console.log('AppComponent: onBulkCreateIncidentsAccepted(): serverFieldDefinitions:', serverFieldDefinitions);
    console.log('AppComponent: onBulkCreateIncidentsAccepted(): serverIncidentTypes:', serverIncidentTypes);
    console.log('AppComponent: onBulkCreateIncidentsAccepted(): serverIncidentTypeNames:', serverIncidentTypeNames);

    // add 'successfulEndpoints', 'failedEndpoints', and 'jsonFiles' properties to validBulkConfigurations
    validBulkConfigurations = this.reduceBulkConfigurationServersToGood(validBulkConfigurations, successfulServerIds);
    console.log('AppComponent: onBulkCreateIncidentsAccepted(): second validBulkConfigurations:', validBulkConfigurations);

    // get list of JSON files to fetch
    const jsonFileIdsToFetch = this.reduceBulkConfigurationJsonFilesToFetch(validBulkConfigurations);
    console.log('AppComponent: onBulkCreateIncidentsAccepted(): jsonFileIdsToFetch:', jsonFileIdsToFetch);

    // retrieve JSON files
    const { jsonFileIds, jsonFilesFetchSuccessful } = await this.bulkCreateRetrieveJsonFiles(jsonFileIdsToFetch);
    console.log('AppComponent: onBulkCreateIncidentsAccepted(): jsonFilesFetchSuccessful:', jsonFilesFetchSuccessful);

    if (jsonFilesFetchSuccessful) {
      // it's possible that no JSON files were needed
      console.log('AppComponent: onBulkCreateIncidentsAccepted(): retrieved all JSON files');
      console.log('AppComponent: onBulkCreateIncidentsAccepted(): jsonFileIds:', jsonFileIds);
    }

    // Create incidents
    this.bulkCreateIncidentJson = await this.bulkCreateWorkLoop(validBulkConfigurations, testResults, serverIncidentTypeNames, jsonFileIds, serverFieldDefinitions);
    console.log('AppComponent: onBulkCreateIncidentsAccepted(): Incident creation complete');
  }



  async onClickDemistoInvestigateUrl(incidentId: number, serverId: string) {
    console.log('AppComponent: onClickDemistoInvestigateUrl(): id:', incidentId);
    const result = await this.fetcherService.createInvestigation(incidentId, serverId);
    if (result.success) {
      const url = `${serverId}/#/incident/${incidentId}`;
      window.open(url, '_blank');
    }
    else if ('error' in result) {
      console.error(`AppComponent: onClickDemistoInvestigateUrl(): XSOAR threw error when opening investigation ${incidentId} on ${serverId}:`, result.error);
    }
  }



  async switchCurrentDemistoEndpoint(serverId: string, previousTestResult?): Promise<void> {
    /*
    Called from onDemistoEndpointSelected()
    Tests selected server, then fetches the list of incident types, then fetches the field definitions.
    Sets currentDemistoEndpointName and currentDemistoEndpointInit
    */
    console.log('AppComponent: switchCurrentDemistoEndpoint(): serverId:', serverId);

    const currentDemistoEndpointNameReselected = this.currentDemistoEndpointId === serverId;
    const serverPreviouslySelected = this.currentDemistoEndpointId !== undefined;
    const incidentConfigIsLoaded = this.loadedIncidentConfigId !== undefined;

    const oldDemistoEndpointInit = this.currentDemistoEndpointInit;

    // this is the procedure to load a demistoEndpoint
    // test it and then 'load' it
    let testRes;
    try {
      if (previousTestResult === undefined) {
        testRes = await this.fetcherService.testDemistoEndpointById(serverId);
      }
      this.currentDemistoEndpointInit = testRes ? testRes.success : previousTestResult;
      this.currentDemistoEndpointId = serverId;
    }
    catch (error) {
      this.currentDemistoEndpointInit = false;
      console.error('AppComponent: switchCurrentDemistoEndpoint(): Error loading Demisto endpoint:', testRes ? testRes : error);
    }

    if (currentDemistoEndpointNameReselected && oldDemistoEndpointInit && this.currentDemistoEndpointInit) {
      console.log('AppComponent: switchCurrentDemistoEndpoint(): currentDemistoEndpointName was re-selected.  Returning');
      return;
    }

    if (this.currentDemistoEndpointInit) {

      // Refresh Demisto Incident Types
      try {
        this.fetchedIncidentTypes = await this.fetchIncidentTypes(this.currentDemistoEndpointId);
      }
      catch (error) {
        console.error('AppComponent: switchCurrentDemistoEndpoint(): Caught error fetching Demisto incident types:', error);
      }

      try {
        // Refresh Demisto Incident Fields
        await this.fetchIncidentFieldDefinitions(this.currentDemistoEndpointId);

        if (incidentConfigIsLoaded && serverPreviouslySelected) {
          const message = `Do you want to attempt to keep your current field values and selections, or revert them to their saved state?`;
          this.confirmationService.confirm( {
            message,
            icon: '',
            acceptLabel: 'Keep Current Values & Selections',
            accept: () => {},
            rejectLabel: 'Revert to Saved State',
            // blow away the current config
            reject: () => this.freeformJsonUIComponent.onIncidentConfigOpened(this.savedIncidentConfigurations[this.loadedIncidentConfigId])

          });
        }

        else if (incidentConfigIsLoaded && !serverPreviouslySelected) {
          // an incident config is loaded and no server was previously selected, but now one is selected
          // destructive
          const selectedConfig = this.savedIncidentConfigurations[this.loadedIncidentConfigId];
          this.freeformJsonUIComponent.buildChosenFieldsFromConfig(selectedConfig);
        }

      }
      catch (error) {
        console.error('AppComponent: switchCurrentDemistoEndpoint(): Caught error fetching Demisto incident fields:', error);
      }

    }

  }



  async onDemistoEndpointSelected() {
    console.log('AppComponent: onDemistoEndpointSelected(): selectedDemistoEndpointName:', this.selectedDemistoEndpointId);
    await this.switchCurrentDemistoEndpoint(this.selectedDemistoEndpointId);
    this.showDemistoEndpointOpenDialog = false;
  }



  async onOpenDemistoServersClicked() {
    console.log('AppComponent: onOpenDemistoServersClicked()');
    this.showDemistoEndpointOpenDialog = true;
  }



  async onNewDemistoEndpointClicked() {
    console.log('AppComponent: onNewDemistoEndpointClicked()');
    this.newDemistoServerDialogMode = 'new';
    this.showDemistoEndpointOpenDialog = false;
    this.showNewDemistoEndpointDialog = true;
    this.newDemistoServerUrl = '';
    this.newDemistoServerApiKey = '';
    this.newDemistoServerTrustAny = true;
    setTimeout( () =>
      document.getElementsByClassName('newDemistoEndpointDialog')[0].getElementsByTagName('input')[0].focus()
      , 100);
  }



  async onNewDemistoEndpointSaved() {
    console.log('AppComponent: onNewDemistoEndpointSaved()');
    this.showNewDemistoEndpointDialog = false;
    this.showDemistoEndpointOpenDialog = true;

    const success = await this.fetcherService.createDemistoEndpoint(this.newDemistoServerUrl, this.newDemistoServerApiKey, this.newDemistoServerTrustAny);
    console.log('AppComponent: onNewDemistoEndpointSaved(): success:', success);

    // refresh servers
    await this.refreshDemistoEndpoints(true);

    this.newDemistoServerUrl = '';
    this.newDemistoServerApiKey = '';
    this.newDemistoServerTrustAny = true;
    this.editingDemistoServerId = undefined;
  }



  onNewDemistoEndpointCancelled() {
    this.showNewDemistoEndpointDialog = false;
    this.showDemistoEndpointOpenDialog = true;
    this.editingDemistoServerId = undefined;
  }



  async onDeleteDemistoEndpointClicked() {
    console.log(`AppComponent: onDeleteDemistoEndpointClicked(): ${this.demistoEndpointIdToDelete}`);
    this.showDemistoEndpointOpenDialog = false;
    this.showDeleteDemistoEndpointDialog = true;
    this.demistoEndpointIdToDelete = this.selectedDemistoEndpointId;
  }



  async onDeleteDemistoEndpointConfirmed() {
    console.log('AppComponent: onDeleteDemistoEndpointConfirmed()');
    this.showDemistoEndpointOpenDialog = true;
    this.showDeleteDemistoEndpointDialog = false;
    let res;
    try {
      res = await this.fetcherService.deleteDemistoEndpoint(this.demistoEndpointIdToDelete);
      await this.refreshDemistoEndpoints();

      console.log('AppComponent: onDeleteDemistoEndpointConfirmed(): demistoEndpoints:', this.demistoEndpoints);

      // handle deletion of current Demisto endpoint
      if (this.demistoEndpointIdToDelete === this.currentDemistoEndpointId) {
        this.currentDemistoEndpointId = undefined;
        this.currentDemistoEndpointInit = false;
        // default endpoint logic will be handled by the server and refreshDemistoEndpoints()
      }
    }
    catch (error) {
      //  do something if there's an error
      console.error(`Caught error deleting ${this.demistoEndpointIdToDelete}`, res.error);
    }

    if (!this.currentDemistoEndpointInit) {
      // Clear Demisto Incident Field Definitions
      this.fetchedIncidentFieldDefinitions = undefined;
      this.freeformJsonUIComponent.updateChosenFieldLocks();
    }

  }



  async onSetDefaultDemistoEndpointClicked() {
    console.log('AppComponent: onSetDefaultDemistoEndpoint()');
    await this.fetcherService.setDefaultDemistoEndpoint(this.selectedDemistoEndpointId);
    await this.refreshDemistoEndpoints();
  }



  async onRefreshDemistoEndpointsClicked() {
    console.log('AppComponent: onRefreshDemistoEndpoints()');
    await this.refreshDemistoEndpoints();
  }



  async onTestDemistoEndpointClicked() {
    console.log('AppComponent: onTestDemistoEndpointClicked(): selectedDemistoEndpointId:', this.selectedDemistoEndpointId);
    let success;
    let error;
    try {
      const testRes = await this.fetcherService.testDemistoEndpointById(this.selectedDemistoEndpointId);
      // let {success, error} = testRes;
      success = testRes.success;
      error = testRes.hasOwnProperty('error') ? testRes.error : undefined;
    }
    catch (err) {
      console.error(`Caught error testing endpoint id ${this.selectedDemistoEndpointId}:`, err);
      this.messagesReplace( [{ severity: 'error', summary: 'Failure', detail: `Internal error testing XSOAR endpoint ${this.demistoEndpoints[this.selectedDemistoEndpointId].url}: ${'message' in error ? error.message : error}`}] );
      return;
    }

    if (this.selectedDemistoEndpointId === this.currentDemistoEndpointId) {
      await this.switchCurrentDemistoEndpoint(this.selectedDemistoEndpointId, success);
    }

    if (success) {
      this.messagesReplace( [{ severity: 'success', summary: 'Success', detail: `XSOAR endpoint ${this.demistoEndpoints[this.selectedDemistoEndpointId].url} test success`}] );
    }
    else {
      this.messagesReplace( [{ severity: 'error', summary: 'Failure', detail: `XSOAR endpoint ${this.demistoEndpoints[this.selectedDemistoEndpointId].url} test failure: ${error}`}] );
    }
  }



  async onEditDemistoEndpointClicked() {
    console.log('AppComponent: onEditDemistoEndpointClicked()');
    this.newDemistoServerDialogMode = 'edit';
    this.showNewDemistoEndpointDialog = true;
    this.showDemistoEndpointOpenDialog = false;

    // get Demisto server details and stick them in
    // newDemistoServerUrl, newDemistoServerApiKey, newDemistoServerTrustAny
    const demistoServer = this.demistoEndpoints[this.selectedDemistoEndpointId];
    this.editingDemistoServerId = this.selectedDemistoEndpointId;
    this.newDemistoServerUrl = demistoServer.url;
    this.newDemistoServerApiKey = '';
    this.newDemistoServerTrustAny = demistoServer.trustAny;
  }



  async onDemistoEndpointUpdated(updatedServerUrl: string) {
    console.log('AppComponent: onDemistoEndpointUpdated()');

    this.showNewDemistoEndpointDialog = false;
    this.showDemistoEndpointOpenDialog = true;

    const oldSelectedDemistoEndpointId = this.selectedDemistoEndpointId;

    const currentDemistoEndpointUpdated = oldSelectedDemistoEndpointId === this.currentDemistoEndpointId;

    let res: any;
    if (this.newDemistoServerApiKey === '') {
      res = await this.fetcherService.updateDemistoEndpoint(this.selectedDemistoEndpointId, this.newDemistoServerUrl, this.newDemistoServerTrustAny );
    }
    else {
      res = await this.fetcherService.updateDemistoEndpoint(this.selectedDemistoEndpointId, this.newDemistoServerUrl, this.newDemistoServerTrustAny, this.newDemistoServerApiKey);
    }

    if (oldSelectedDemistoEndpointId === this.currentDemistoEndpointId) {
      // it's necessary to fix currentDemistoEndpointName if it has been edited
      // before running refreshDemistoEndpoints()
      this.currentDemistoEndpointId = this.newDemistoServerUrl;
    }

    // refresh servers
    await this.refreshDemistoEndpoints();

    if (currentDemistoEndpointUpdated && this.currentDemistoEndpointInit) {
      // Refresh Demisto Incident Fields, if current server is initialised
      try {
        await this.fetchIncidentFieldDefinitions(this.currentDemistoEndpointId);

        if (this.loadedIncidentConfigId) {
          const message = `Do you want to attempt to keep your current field values and selections, or reset them to their saved state?`;
          this.confirmationService.confirm( {
            message,
            icon: '',

            acceptLabel: 'Keep Current Values & Selections',
            accept: () => this.freeformJsonUIComponent.updateChosenFieldLocks(),

            rejectLabel: 'Reset to Saved State',
            reject: () => this.freeformJsonUIComponent.buildChosenFieldsFromConfig(this.savedIncidentConfigurations[this.loadedIncidentConfigId])
          });
        }
      }
      catch (error) {
        console.error('AppComponent: onDemistoEndpointUpdated(): Caught error fetching Demisto incident fields:', error);
      }

      // Refresh Demisto Incident Types
      try {
        this.fetchedIncidentTypes = await this.fetchIncidentTypes(this.currentDemistoEndpointId);
      }
      catch (error) {
        console.error('AppComponent: onDemistoEndpointUpdated(): Caught error fetching Demisto incident types:', error);
      }
    }

    this.newDemistoServerUrl = '';
    this.newDemistoServerApiKey = '';
    this.newDemistoServerTrustAny = true;
    this.editingDemistoServerId = undefined;
  }



  onNewEditDemistoEndpointHidden() {
    this.showDemistoEndpointOpenDialog = true;
  }



  onNewJsonMappingClicked() {
    if (this.showJsonMappingUI) {
      this.confirmationService.confirm({
        header: `Proceed?`,
        message: `Proceed with creating a new JSON mapping?  Any unsaved changes will be lost.`,
        accept: () => {
          this.showJsonMappingUI = false;
          this.loadedIncidentConfigId = undefined;
          this.loadedIncidentConfigName = undefined;
          this.changeDetector.detectChanges();
          this.showJsonMappingUI = true;
          this.loadDefaultChosenFields = true;
        },
        reject: () => {},
        acceptLabel: `Proceed`,
        rejectLabel: `Cancel`,
        icon: '',
        defaultFocus: 'reject'
      });
    }
    else {
      this.showJsonMappingUI = true;
      this.loadDefaultChosenFields = true;
      this.loadedIncidentConfigId = undefined;
      this.loadedIncidentConfigName = undefined;
    }
  }



  async getSavedIncidentConfigurations(): Promise<boolean> {
    // Get Incident Configurations
    try {
      this.savedIncidentConfigurations = await this.fetcherService.getSavedIncidentConfigurations();
      console.log('AppComponent: getSavedIncidentConfigurations(): savedIncidentConfigurations:', this.savedIncidentConfigurations);
      this.savedIncidentConfigItems = this.buildFieldsConfigItems(this.savedIncidentConfigurations);
      if (this.loadedIncidentConfigId) {
        this.loadedIncidentConfigName = this.savedIncidentConfigurations[this.loadedIncidentConfigId].name;
      }
      return true;
    }
    catch (error) {
      console.error('AppComponent: getSavedIncidentConfigurations(): Caught error fetching fields configuration:', error);
      return false;
    }
  }



  selectItemsSort(a: SelectItem, b: SelectItem): number {
    return utils.sortArrayNaturally(a.label, b.label);
  }



  buildFieldsConfigItems(configs: IncidentConfigs): SelectItem[] {
    const items: SelectItem[] = Object.values(configs).map( (config: IncidentConfig) =>
      ({ label: config.name, value: config.id })
    );
    return items.sort(this.selectItemsSort);
  }



  async onSavedIncidentConfigurationsChanged(newIncidentConfigId?) {
    // Update Incident Configurations
    if (newIncidentConfigId) {
      this.loadedIncidentConfigId = newIncidentConfigId;
      // it isn't necessary to set this.loadedIncidentConfigName here; getSavedIncidentConfigurations() will do this for us
    }
    await this.getSavedIncidentConfigurations();
  }


  onLoadFromDemistoClicked() {
    this.showLoadFromDemistoDialog = true;
    if (this.currentDemistoEndpointId !== '') {
      this.demistoEndpointToLoadFrom = this.currentDemistoEndpointId;
    }
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      document.getElementsByClassName('loadFromDemistoDialog')[0].getElementsByTagName('input')[0].focus();
    }, 100);
  }



  onLoadFromDemistoCancelled() {
    this.showLoadFromDemistoDialog = false;
  }



  async loadFromDemisto() {
    console.log('AppComponent: loadFromDemisto()');

    let importResult: DemistoIncidentImportResult;
    try {
      importResult = await this.fetcherService.demistoIncidentImport(this.demistoIncidentIdToLoad, this.demistoEndpointToLoadFrom);
      console.log('AppComponent: loadFromDemisto(): importResult:', importResult);
    }
    catch (error) {
      if ('message' in error) {
        error = error.message;
      }
      this.messagesReplace( [{ severity: 'error', summary: 'Error', detail: `Error thrown pulling XSOAR incident ID ${this.demistoIncidentIdToLoad}: ${error}`}] );
    }

    const demistoEndpointName = this.demistoEndpoints[this.demistoEndpointToLoadFrom].url;

    if (importResult.success) {
      this.showJsonMappingUI = true;
      this.loadDefaultChosenFields = false;
      this.loadedIncidentConfigName = undefined;
      this.loadedIncidentConfigId = undefined;
      this.changeDetector.detectChanges();

      this.freeformJsonUIComponent.onIncidentLoadedFromDemisto(importResult, this.demistoIncidentIdToLoad, demistoEndpointName);
      this.demistoEndpointToLoadFrom = '';
      this.demistoIncidentIdToLoad = '';
    }

    else if (importResult.error === `Query returned 0 results`) {
      this.messagesReplace( [{ severity: 'error', summary: 'Failure', detail: `Incident ID ${this.demistoIncidentIdToLoad} was not found on XSOAR server '${demistoEndpointName}'`}] );
    }

    else {
      this.messagesReplace( [{ severity: 'error', summary: 'Error', detail: `Error returned fetching XSOAR incident ${this.demistoIncidentIdToLoad}: ${importResult.error}`}] );
    }

  }



  async onLoadFromDemistoAccepted() {
    console.log('AppComponent: onLoadFromDemistoAccepted()');
    this.showLoadFromDemistoDialog = false;

    if (this.showJsonMappingUI) {
      this.confirmationService.confirm({
        header: `Proceed?`,
        message: `Proceed with loading an XSOAR incident?  Any unsaved changes will be lost.`,
        accept: async () => await this.loadFromDemisto(),
        reject: () => {},
        acceptLabel: `Proceed`,
        rejectLabel: `Cancel`,
        icon: '',
        defaultFocus: 'reject'
      });
    }
    else {
      await this.loadFromDemisto();
    }

  }



  onFieldMappingSelectionActive() {
    this.showFieldMappingSelectionBox = true;
  }



  onFieldMappingSelectionEnded() {
    this.showFieldMappingSelectionBox = false;
  }



  refreshJsonGroupUIConfig() {
    console.log('AppComponent: refreshJsonGroupUIConfig()');
    console.log('AppComponent: refreshJsonGroupUIConfig(): jsonGroupConfigurationsItems:', this.jsonGroupConfigurationsItems);

    const jsonGroupDialogSelections = {};
    for (const jsonGroup of Object.values(this.jsonGroupConfigurations)) {
      jsonGroupDialogSelections[jsonGroup.id] = Object.assign([], jsonGroup.jsonFileIds);
    }
    this.jsonGroupDialog_jsonFileSelections = jsonGroupDialogSelections;
    console.log('AppComponent: refreshJsonGroupUIConfig(): jsonGroupDialogSelections:', this.jsonGroupDialog_jsonFileSelections);
  }



  onJsonGroupButtonClicked() {
    console.log('AppComponent: onJsonGroupButtonClicked()');
    this.showJsonGroupsDialog = true;
    this.refreshJsonGroupUIConfig();
  }



  /*onJsonGroupSelected_JsonGroupDialog() {
    console.log('AppComponent: onJsonGroupSelected_JsonGroupDialog()');
  }*/



  async onNewJsonGroupClicked() {
    console.log('AppComponent: onNewJsonGroupClicked()');
    this.showNewJsonConfigDialog = true;
    // this.showJsonGroupsDialog = false;
    this.newJsonGroupConfigName = '';
    setTimeout( () =>
      document.getElementsByClassName('newJsonGroupConfigDialog')[0].getElementsByTagName('input')[0].focus()
      , 100);
  }



  async onNewJsonGroupAccepted() {
    console.log('AppComponent: onNewJsonGroupAccepted()');
    const newJsonGroupConfig: JsonGroup = {
      name: this.newJsonGroupConfigName,
      jsonFileIds: []
    };
    this.showNewJsonConfigDialog = false;

    try {
      const res = await this.fetcherService.saveNewJsonGroupConfiguration(newJsonGroupConfig);
      const {id} = res;
      await this.getSavedJsonGroupConfigurations();
      this.jsonGroupDialog_jsonGroupSelection = id;
      this.jsonGroupDialog_jsonFileSelections[id] = [];
    }
    catch (error) {
      console.error('AppComponent: onNewJsonGroupAccepted(): Caught error saving JSON Groups configurations:', error);
      return;
    }
  }



  async onDeleteJsonGroupConfirmed(jsonGroupIdToDelete: string) {
    console.log(`AppComponent: onDeleteJsonGroupConfirmed(): jsonGroupIdToDelete: ${jsonGroupIdToDelete}`);
    try {
      await this.fetcherService.deleteJsonGroupConfiguration(jsonGroupIdToDelete);
      await this.getSavedJsonGroupConfigurations();
      if (jsonGroupIdToDelete === this.jsonGroupDialog_jsonGroupSelection) {
        this.jsonGroupDialog_jsonGroupSelection = undefined;
      }
      delete this.jsonGroupDialog_jsonFileSelections[jsonGroupIdToDelete];
    }
    catch (error) {
      console.error(`AppComponent: onDeleteJsonGroupConfirmed(): Caught error deleting JSON Group configuration '${jsonGroupIdToDelete}':`, error);
      return;
    }
  }



  onDeleteJsonGroupClicked() {
    console.log(`AppComponent: onDeleteJsonGroupClicked(): ${this.jsonGroupDialog_jsonGroupSelection}`);
    this.showJsonGroupDeleteDialog = true;
    // this.showJsonGroupsDialog = false;
    const jsonGroupIdToDelete = this.jsonGroupDialog_jsonGroupSelection;
    const jsonGroupToDelete = this.jsonGroupConfigurations[jsonGroupIdToDelete];
    this.confirmationService.confirm( {
      header: `Confirm Deletion`,
      message: `Are you sure that you would like to delete JSON group '${jsonGroupToDelete.name}'`,
      accept: () => this.onDeleteJsonGroupConfirmed(jsonGroupIdToDelete),
      icon: 'pi pi-exclamation-triangle'
    });
  }



  async onAcceptJsonGroupChanges() {
    console.log(`AppComponent: onAcceptJsonGroupChanges()`);
    // console.log(`AppComponent: onAcceptJsonGroupChanges(): jsonGroupDialog_jsonFileSelections:`, this.jsonGroupDialog_jsonFileSelections);

    for (const jsonGroupId of Object.keys(this.jsonGroupDialog_jsonFileSelections)) {
      const jsonGroup = this.jsonGroupConfigurations[jsonGroupId];
      const jsonSelections = this.jsonGroupDialog_jsonFileSelections[jsonGroupId];
      const groupConfig: JsonGroup = {
        id: jsonGroupId,
        name: jsonGroup.name,
        jsonFileIds: jsonSelections
      };
      await this.fetcherService.saveUpdatedJsonGroupConfiguration(groupConfig);
    }
    await this.getSavedJsonGroupConfigurations();
    this.showJsonGroupsDialog = false;
  }



  onSelectAllJsonConfigurations() {
    console.log(`AppComponent: onSelectAllJsonConfigurations()`);
    this.jsonGroupDialog_jsonFileSelections[this.jsonGroupDialog_jsonGroupSelection] = Object.assign(this.savedJsonConfigurations, []);
  }



  onUnselectAllJsonConfigurations() {
    console.log(`AppComponent: onUnselectAllJsonConfigurations()`);
    this.jsonGroupDialog_jsonFileSelections[this.jsonGroupDialog_jsonGroupSelection] = [];
  }



  buildJsonFileAndGroupConfigurationsItems() {
    let items: SelectItem[] = [];
    if (this.jsonGroupConfigurations) {
      items = items.concat( Object.values(this.jsonGroupConfigurations).map( jsonGroupConfig => ({
        value: `g_${jsonGroupConfig.id}`,
        label: `${jsonGroupConfig.name} (Group)` } as SelectItem) ));
    }
    if (this.savedJsonConfigurations) {
      items = items.concat(this.savedJsonConfigurations.map( jsonConfig => ({
        value: `j_${jsonConfig.id}`,
        label: `${jsonConfig.name} (JSON)` } as SelectItem)));
    }
    this.jsonFileAndGroupConfigurationsItems = items.sort(utils.sortArrayNaturally);
  }



  onViewBulkIncidentJSONClicked(incidentId: number, serverId: string) {
    console.log('AppComponent: onViewBulkIncidentJSONClicked()');

    const incidentJson = this.bulkCreateIncidentJson[serverId][incidentId];

    let config: DynamicDialogConfig = {
      header: `JSON of XSOAR Incident ${incidentId} for '${serverId}'`,
      closable: true,
      closeOnEscape: true,
      data: {
        value: incidentJson,
        readOnly: true,
        showResetValues: false
      },
      width: '95%',
      height: '90%'
    };
    const dialogRef = this.dialogService.open(JsonEditorComponent, config);
  }



  async onFileAttachmentConfigsChanged() {
    await this.getSavedFileAttachmentConfigurations();
  }



  /// File Attachments ///



  onFileAttachmentsButtonClicked() {
    console.log('AppComponent: onFileAttachmentsButtonClicked()');
    this.showFileAttachmentsDialog = true;
  }



  onDeleteFileAttachmentConfigClicked() {
    console.log('AppComponent: onDeleteFileAttachmentConfigClicked(): selectedFileAttachment:', this.selectedFileAttachment);
  }



  onDeleteFileAttachmentClicked(selectedFileAttachment) {
    this.showFileAttachmentsDialog = false;
    const selectedFileAttachmentName = this.fileAttachmentConfigs[selectedFileAttachment].filename;
    console.log('AppComponent: onDeleteFileAttachmentClicked(): selectedFileAttachment:', selectedFileAttachment);
    this.showNewFileAttachmentDialog = false;
    this.confirmationService.confirm({
      header: `Delete attachment '${selectedFileAttachmentName}'?`,
      message: `Proceed with deleting attachment '${selectedFileAttachmentName}'?  It will also be removed from any referenced incident configs.`,
      accept: async () => {
        this.showFileAttachmentsDialog = true;
        await this.fetcherService.deleteFileAttachment(selectedFileAttachment);
        this.selectedFileAttachment = undefined;
        await this.onFileAttachmentConfigsChanged();
        await this.getSavedIncidentConfigurations();
        if (this.freeformJsonUIComponent) {
          this.freeformJsonUIComponent.onAttachmentsRemovedFromServer();
        }
      },
      reject: () => {
        this.showFileAttachmentsDialog = true;
      },
      acceptLabel: `Delete`,
      rejectLabel: `Cancel`,
      icon: '',
      defaultFocus: 'reject'
    });
  }



  onNewFileAttachmentClicked() {
    console.log('AppComponent: onNewFileAttachmentClicked()');
    this.showFileAttachmentsDialog = false;
    this.showNewFileAttachmentDialog = true;
    this.uploadFileAttachmentAdded = false;
    this.newFileAttachmentName = undefined;
    this.newFileAttachmentComment = undefined;
    this.newFileAttachmentSize = undefined;
    this.newFileAttachmentType = undefined;
    this.newFileAttachmentDisplayAsMediaSelection = false;
  }



  onNewFileAttachmentCancelled() {
    this.showFileAttachmentsDialog = true;
    this.showNewFileAttachmentDialog = false;
    this.uploadFileAttachmentAdded = false;
    this.attachmentUploaderComponent.clear();
  }



  async onSubmitFileAttachmentUpload() {
    console.log('AppComponent: onSubmitFileAttachmentUpload()');
    this.showFileAttachmentsDialog = true;
    this.showNewFileAttachmentDialog = false;
    this.attachmentUploaderComponent.upload();
    this.attachmentUploaderComponent.clear();
  }



  onDownloadFileAttachmentClicked(selectedFileAttachmentId) {
    console.log('AppComponent: onDownloadFileAttachmentClicked()');
    this.fetcherService.downloadFileAttachment(selectedFileAttachmentId);
  }



  onNewAttachmentFileSelected(event) {
    console.log('AppComponent: onNewAttachmentFileSelected(): event:', event);
    this.uploadFileAttachmentAdded = true;
    const {originalEvent, files, currentFiles} = event;
    this.newFileAttachmentName = currentFiles[0].name;
    this.newFileAttachmentSize = currentFiles[0].size;
    this.newFileAttachmentType = currentFiles[0].type;
    this.newFileAttachmentComment = '';
  }



  async onUploadFileAttachment(event) {
    console.log('AppComponent: onUploadFileAttachment(): event:', event);
    const files = event.files;
    const formData = new FormData();
    for (const file of files) {
      formData.append(this.attachmentUploaderComponent.name, file, this.newFileAttachmentName);
      formData.append('comment', this.newFileAttachmentComment);
      formData.append('mediaFile', `${this.newFileAttachmentDisplayAsMediaSelection}`);
    }
    try {
      const response = await this.fetcherService.uploadFileAttachment(formData);
      console.log('AppComponent: onUploadFileAttachment(): response:', response);
      const id = response.id;
      await this.onFileAttachmentConfigsChanged();
    }
    catch (error) {
      console.error('Caught error submitting file attachment:', error);
    }
  }



  /// Edit File Attachment ///

  onEditFileAttachmentClicked(selectedFileAttachment) {
    console.log('AppComponent: onEditFileAttachmentClicked()');
    this.showEditFileAttachmentDialog = true;
    this.showFileAttachmentsDialog = false;
    const fileAttachment = this.fileAttachmentConfigs[selectedFileAttachment];
    this.editFileAttachmentName = fileAttachment.filename;
    this.editFileAttachmentComment = fileAttachment.comment;
    this.editFileAttachmentSize = fileAttachment.size;
    this.editFileAttachmentType = fileAttachment.detectedType;
    this.editFileAttachmentDisplayAsMediaSelection = fileAttachment.mediaFile;
  }



  onEditFileAttachmentCancelled() {
    console.log('AppComponent: onEditFileAttachmentCancelled()');
    this.showEditFileAttachmentDialog = false;
    this.showFileAttachmentsDialog = true;
  }



  async onEditFileAttachmentSubmit(selectedFileAttachment) {
    console.log('AppComponent: onEditFileAttachmentSubmit()');
    this.showEditFileAttachmentDialog = false;
    this.showFileAttachmentsDialog = true;
    const updatedConfig: FileAttachmentConfig = {
      id: selectedFileAttachment,
      filename: this.editFileAttachmentName,
      mediaFile: this.editFileAttachmentDisplayAsMediaSelection,
      comment: this.editFileAttachmentComment
    };
    try {
      const results = await this.fetcherService.updateFileAttachment(updatedConfig);
      console.log('AppComponent: onEditFileAttachmentSubmit(): results:', results);
      await this.onFileAttachmentConfigsChanged();
      this.changeDetector.detectChanges();
      if (this.freeformJsonUIComponent) {
        this.freeformJsonUIComponent.onAttachmentsEdited();
      }
    }
    catch (error) {
      console.error('Caught error submitting edited file attachment:', error);
    }

  }

  /// END Edit File Attachment ///



  /// Import Mapped Configuration ///

  onImportConfigClicked() {
    console.log('AppComponent: onImportConfigClicked()');
    this.showImportIncidentMappingDialog = true;
    this.duplicateIncidentMappingFromImport = false;
    this.overrideDuplicateIncidentMappingFromImport = false;
    this.incidentMappingSubmitButtonEnabled = false;
    this.validIncidentMappingFile = true;
    this.mappingToImport = undefined;
  }



  validateImportedMapping(mapping: object): boolean {
    const propertiesToCheck = ['name', 'id', 'chosenFields', 'createInvestigation', 'incidentType'];

    for (const property of propertiesToCheck) {
      if (!mapping.hasOwnProperty(property)) {
        return false;
      }
    }
    return true;
  }



  onIncidentMappingUploaded(data: { files: File }, uploadRef) {
    const file = data.files[0];
    console.log('AppComponent: onIncidentMappingUploaded(): file:', file);

    const reader = new FileReader();

    reader.onloadend = (progressEvent: ProgressEvent) => {

      let parsedMapping;
      // these values must be reset every time a new file is uploaded
      this.duplicateIncidentMappingFromImport = false;
      this.overrideDuplicateIncidentMappingFromImport = false;
      this.incidentMappingSubmitButtonEnabled = false;
      this.validIncidentMappingFile = true;
      this.mappingToImport = undefined;

      try {
        parsedMapping = JSON.parse(reader.result as string);
        console.log('AppComponent: onIncidentMappingUploaded(): parsedMapping:', parsedMapping);
        uploadRef.clear(); // allow future uploads
      }
      catch (error) {
        console.error('onIncidentJsonUploaded(): Error parsing uploaded JSON:', error);
        uploadRef.clear(); // allow future uploads
        return;
      }

      if (!this.validateImportedMapping(parsedMapping)) {
        this.validIncidentMappingFile = false;
        return;
      }

      this.mappingToImport = parsedMapping;

      if (
        this.savedIncidentConfigurations.hasOwnProperty(this.mappingToImport.id)
        || this.savedIncidentConfigurationNames.hasOwnProperty(this.mappingToImport.name) ) {
          this.duplicateIncidentMappingFromImport = true;
      }

      this.incidentMappingSubmitButtonEnabled = this.duplicateIncidentMappingFromImport ? false : true;
    };

    reader.readAsText(data.files[0]); // kick off the read operation (calls reader.onloadend())
  }



  onOverrideDuplicateIncidentMappingFromImportChanged(value: boolean) {
    console.log('AppComponent: onOverrideDuplicateIncidentMappingFromImportChanged()');
    this.incidentMappingSubmitButtonEnabled = value;
  }



  async onImportMappingAccepted() {
    console.log('AppComponent: onImportMappingAccepted()');

    this.showImportIncidentMappingDialog = false;

    // add to the server here

    let saveRes;
    if (this.duplicateIncidentMappingFromImport) {
      try {
        saveRes = await this.fetcherService.saveUpdatedIncidentConfiguration(this.mappingToImport);
      }
      catch (error) {
        console.error('AppComponent: onImportMappingAccepted(): caught error saving updated incident configuration: error:', error);
        return;
      }
    }
    else {
      try {
        saveRes = await this.fetcherService.saveNewIncidentConfiguration(this.mappingToImport);
      }
      catch (error) {
        console.error('AppComponent: onImportMappingAccepted(): caught error saving new incident configuration: error:', error);
        return;
      }
    }

    // now refresh incident configs
    const res = await this.getSavedIncidentConfigurations();

    if (!res) {
      console.error('AppComponent: onImportMappingAccepted(): Incident config refresh failed.  Aborting');
      return;
    }

    const namesMatch = this.loadedIncidentConfigName === this.mappingToImport.name;
    const idsMatch = this.loadedIncidentConfigId === this.mappingToImport.id;

    if (namesMatch || idsMatch) {
      this.onIncidentConfigOpened(this.mappingToImport);
    }
  }



  onImportMappingCancelled() {
    console.log('AppComponent: onImportMappingCancelled()');
    this.showImportIncidentMappingDialog = false;
  }

  /// END Import Mapped Configuration ///


}
