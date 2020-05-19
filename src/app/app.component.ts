import { Component, OnInit, ChangeDetectorRef, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { FetcherService } from './fetcher-service';
import { DemistoEndpoint, DemistoEndpoints } from './types/demisto-endpoints';
import { User } from './types/user';
import { DemistoEndpointStatus } from './types/demisto-endpoint-status';
import { SelectItem, ConfirmationService } from 'primeng/api';
import { IncidentField, IncidentFields } from './types/incident-fields';
import { FetchedIncidentType } from './types/fetched-incident-types';
import { FetchedIncidentField, FetchedIncidentFieldDefinitions } from './types/fetched-incident-field';
import { IncidentConfig, IncidentConfigs } from './types/incident-config';
import { PMessageOption } from './types/message-options';
import { BulkCreateConfigurationToPush, BulkCreateSelection, BulkCreateSelections, BulkCreateResult } from './types/bulk-create';
import { FreeformJsonUIComponent } from './freeform-json-ui.component';
import { Subscription } from 'rxjs';
import * as utils from './utils';
import { JsonGroup, JsonGroups } from './types/json-group';

type DemistoServerEditMode = 'edit' | 'new';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})



export class AppComponent implements OnInit {

  constructor(
    private fetcherService: FetcherService, // import our URL fetcher
    private confirmationService: ConfirmationService,
    private changeDetector: ChangeDetectorRef
  ) {}

  @ViewChild(FreeformJsonUIComponent) freeformJsonUIComponent: FreeformJsonUIComponent;

  loggedInUser: User;

  // Endpoint Properties
  demistoEndpoints: DemistoEndpoints = {};
  get demistoEndpointsLen() { return Object.keys(this.demistoEndpoints).length; }
  defaultDemistoEndpointName: string;
  currentDemistoEndpointName: string;
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
  set savedIncidentConfigurations(value: IncidentConfigs) {
    this._savedIncidentConfigurations = value;

  }
  get savedIncidentConfigurationsLen(): number {
    // returns the number of saved field configs
    return Object.keys(this.savedIncidentConfigurations).length;
  }
  loadedIncidentConfigName: string; // must clear when loaded from json or when current config is deleted
  loadedIncidentConfigId: string; // must clear when loaded from json or when current config is deleted

  // Delete dialog
  showDeleteDialog = false;
  selectedDeleteConfigs: string[] = [];

  // Open dialog
  showOpenDialog = false;
  selectedOpenConfig = '';

  // Bulk create dialog
  showBulkCreateDialog = false;
  bulkCreateSelections: BulkCreateSelections;
  selectedBulkCreateIncidentConfig: string;
  selectedBulkCreateEndpoints: string[] = [];
  bulkConfigurationsToPush: BulkCreateConfigurationToPush[] = [];

  // Bulk results dialog
  showBulkResultsDialog = false;
  bulkCreateResults: BulkCreateResult[] = [];

  // Select Demisto endpoint dialog
  showDemistoEndpointOpenDialog = false;
  selectedDemistoEndpointName: string;

  // New / edit Demisto endpoint dialog
  showNewDemistoEndpointDialog = false;
  newDemistoServerUrl = '';
  newDemistoServerApiKey = '';
  newDemistoServerTrustAny = true;
  get newDemistoServerSaveDisabled() {
    if (this.newDemistoServerDialogMode === 'new') {
      return this.newDemistoServerUrl in this.demistoEndpoints;
    }
    // edit mode
    return this.selectedDemistoEndpointName !== this.newDemistoServerUrl && this.newDemistoServerUrl in this.demistoEndpoints;
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
  demistoEndpointToDelete: string;

  saveAsButtonEnabled = false;
  loadDefaultChosenFields = false;

  // Json Mapping UI
  showJsonMappingUI = false;
  loadedJsonMappingConfigId: string; // must clear when a new config is created, when a config is opened, or when the current config is deleted

  // Import from Demisto dialog
  showLoadFromDemistoDialog = false;
  demistoIncidentToLoad = '';
  demistoEndpointToLoadFrom = '';
  get importFromDemistoAcceptDisabled(): boolean {
    return this.demistoEndpointToLoadFrom === '' || this.demistoIncidentToLoad.match(/^\d+$/) === null;
  }

  // fieldMappingSelection Box
  showFieldMappingSelectionBox = false;

  // Freeform JSON Configs
  _savedJsonConfigurations: string[] = [];
  get savedJsonConfigurations(): string[] {
    return this._savedJsonConfigurations;
  }
  set savedJsonConfigurations(value: string[]) {
    this._savedJsonConfigurations = value;
    this.savedJsonConfigurationItems = this.savedJsonConfigurations.map( val => ({value: val, label: val} as SelectItem))
  }
  savedJsonConfigurationItems: SelectItem[];
  
  // JSON Groups Config & UI
  _jsonGroupConfigurations: JsonGroups = {}
  get jsonGroupConfigurations(): JsonGroups {
    return this._jsonGroupConfigurations
  };
  set jsonGroupConfigurations(value: JsonGroups) {
    console.log('groupvalue:', value);
    this._jsonGroupConfigurations = value;
    this.jsonGroupConfigurationsItems = Object.values(this._jsonGroupConfigurations).map( jsonConfig => ({ value: jsonConfig.name, label: jsonConfig.name} as SelectItem) );
  }
  showJsonGroupsDialog = false;
  jsonGroupConfigurationsItems: SelectItem[] = [];  
  jsonGroupSelection_JsonGroupDialog: string;
  showNewJsonConfigDialog = false;
  newJsonGroupConfigName: string;
  showJsonGroupDeleteDialog = false;
  jsonGroupDialogItems = {}; // temporary holder for group membership items in JSON Groups dialog
  jsonGroupDialogSelections = {}; // temporary holder for group membership selections in JSON Groups dialog
  get newJsonGroupAcceptButtonDisabled(): boolean {
    return this.newJsonGroupConfigName in this._jsonGroupConfigurations;
  }
  
  private subscriptions = new Subscription();
  
  



  async ngOnInit() {
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
        await this.fetchIncidentFieldDefinitions(this.currentDemistoEndpointName);
      }
      catch (error) {
        console.error('AppComponent: ngOnInit(): Caught error fetching Demisto incident fields:', error);
      }

      // Demisto Incident Types
      try {
        await this.fetchIncidentTypes(this.currentDemistoEndpointName);
      }
      catch (error) {
        console.error('AppComponent: ngOnInit(): Caught error fetching Demisto incident types:', error);
      }
    }

    if (this.demistoEndpointsLen === 0) {
      setTimeout(() => this.onNewDemistoEndpointClicked(), 0);
    }

    await this.getSavedIncidentConfigurations();

    await this.getSavedJsonConfigurations();

    await this.getSavedJsonGroupConfigurations();

  }



  async getSavedJsonConfigurations() {
    try {
      this.savedJsonConfigurations = await this.fetcherService.getSavedJSONConfigurationNames();
      console.log('AppComponent: getSavedJsonConfigurations(): savedJsonConfigurations:', this.savedJsonConfigurations);
    }
    catch (error) {
      console.error('AppComponent: getSavedJsonConfigurations(): Caught error fetching Freeform JSON configurations:', error);
    }
  }



  async getSavedJsonGroupConfigurations() {
    try {
      this.jsonGroupConfigurations = await this.fetcherService.getSavedJsonGroupConfigurations();
      console.log('AppComponent: getSavedJsonGroupConfigurations(): savedJsonConfigurations:', this.jsonGroupConfigurations);
    }
    catch (error) {
      console.error('AppComponent: getSavedJsonGroupConfigurations(): Caught error fetching JSON Groups configurations:', error);
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

      this.demistoEndpoints = await this.fetcherService.getDemistoEndpoints(); // obtain saved Demisto endpoints
      console.log('AppComponent: demistoEndpointInit(): demistoEndpoints:', this.demistoEndpoints);

      const defaultEndpointResult = await this.fetcherService.getDefaultDemistoEndpoint();
      console.log('AppComponent: demistoEndpointInit(): defaultEndpointResult:', defaultEndpointResult);

      const configsAreEmpty = this.demistoEndpointsLen === 0;
      const defaultDemistoEndpointDefinedButMissing = !configsAreEmpty && defaultEndpointResult.defined && !(defaultEndpointResult.serverId in this.demistoEndpoints);
      const defaultDemistoEndpointIsDefined = !configsAreEmpty && defaultEndpointResult.defined && defaultEndpointResult.serverId in this.demistoEndpoints;

      if (configsAreEmpty) {
        this.currentDemistoEndpointInit = false;
        this.currentDemistoEndpointName = undefined;
        this.defaultDemistoEndpointName = undefined;
        this.messageWithAutoClear( { severity: 'info', summary: 'Info', detail: `No Demisto servers are defined.  Configure one below`} );
      }

      else if (defaultDemistoEndpointDefinedButMissing) {
        this.messageWithAutoClear( { severity: 'error', summary: 'Error', detail: `The default Demisto server ${this.defaultDemistoEndpointName} is not defined.  This shouldn't happen.`} );
        this.currentDemistoEndpointInit = false;
        this.currentDemistoEndpointName = undefined;
        this.defaultDemistoEndpointName = undefined;
      }

      else if (defaultDemistoEndpointIsDefined) {

        this.defaultDemistoEndpointName = defaultEndpointResult.serverId;
        this.currentDemistoEndpointName = this.defaultDemistoEndpointName;

        let testRes = await this.fetcherService.testDemistoEndpointById(this.defaultDemistoEndpointName);

        this.currentDemistoEndpointInit = testRes.success;

        if (this.currentDemistoEndpointInit) {
          this.messageWithAutoClear( { severity: 'success', summary: 'Success', detail: `Communication to XSOAR endpoint ${this.currentDemistoEndpointName} is initialised`});
        }
        else {
          this.messageWithAutoClear( { severity: 'error', summary: 'Failure', detail: `Communication to XSOAR endpoint ${this.currentDemistoEndpointName} is not initialised`} );
        }

        this.buildDemistoEndpointItems();
      }


    }
    catch (err) {
      console.log('AppComponent: demistoEndpointInit(): Caught error fetching Demisto endpoint status:', err);
    }
  }



  buildDemistoEndpointItems() {
    console.log('AppComponent: buildDemistoEndpointItems()');
    this.demistoEndpointsItems = Object.keys(this.demistoEndpoints).map( key => ({ value: key, label: this.defaultDemistoEndpointName && key === this.defaultDemistoEndpointName ? `${key} (default)` : key}
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
    const lastCurrentDemistoEndpointName = this.currentDemistoEndpointName;

    this.demistoEndpoints = await this.fetcherService.getDemistoEndpoints(); // obtain saved Demisto endpoints

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
      this.currentDemistoEndpointName = undefined;
    }
    else if (defaultDemistoEndpointIsDefined) {
      this.defaultDemistoEndpointName = defaultEndpointResult.serverId;
    }

    const currentEndpointStillDefined = this.currentDemistoEndpointName && this.currentDemistoEndpointName in this.demistoEndpoints; // make sure the currently selected Demisto endpoint hasn't been deleted

    if (!currentEndpointStillDefined) {
      // clear selected endpoint
      this.currentDemistoEndpointName = undefined;
    }

    if (this.currentDemistoEndpointName) {
      // test the currently selected server
      let testRes = await this.fetcherService.testDemistoEndpointById(this.currentDemistoEndpointName);

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
        result = await this.fetcherService.testDemistoEndpointAdhoc({url, trustAny, serverId: this.selectedDemistoEndpointName});
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



  async fetchIncidentTypes(serverId): Promise<boolean> {
    /*
      Called from ngOnInit()
      Fetches incident types from Demisto
    */
    console.log('AppComponent: fetchIncidentTypes()');
    try {
      const fetchedIncidentTypes: FetchedIncidentType[] = await this.fetcherService.getIncidentTypes(serverId);
      console.log('AppComponent: fetchIncidentTypes():', fetchedIncidentTypes);
      this.fetchedIncidentTypes = fetchedIncidentTypes;

    }
    catch (err) {
      console.log('AppComponent: fetchIncidentTypes(): Caught error fetching Demisto incident types:', err);
      return false;
    }
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
        this.loadedIncidentConfigName = undefined;
        this.loadedIncidentConfigId = undefined;
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



  onConfigOpened() {
    console.log('AppComponent: onConfigOpened()');
    this.showOpenDialog = false;
    this.showJsonMappingUI = true;
    this.loadDefaultChosenFields = false;
    this.changeDetector.detectChanges();
    
    const selectedConfig = this.savedIncidentConfigurations[this.selectedOpenConfig];
    this.loadedIncidentConfigName = selectedConfig.name;
    this.loadedIncidentConfigId = selectedConfig.id;
    this.freeformJsonUIComponent.onIncidentConfigOpened(selectedConfig);
    this.selectedOpenConfig = ''; // reset selection
  }


  onSaveAsClicked() {
    console.log('AppComponent: onSaveAsClicked()');
    this.freeformJsonUIComponent.onIncidentSaveAsClicked();
  }



  async onSaveClicked() {
    console.log('AppComponent: onSaveClicked()');
   
    await this.freeformJsonUIComponent.onIncidentSaveClicked();
    this.messageWithAutoClear({severity: 'success', summary: 'Successful', detail: `Configuration '${this.selectedOpenConfig}' has been saved`});

    // Get Fields Configurations
    await this.getSavedIncidentConfigurations();
  }



  onDeleteConfigClicked() {
    console.log('AppComponent: onDeleteConfigClicked()');
    this.showDeleteDialog = true;
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      (document.getElementsByClassName('deleteConfigDialog')[0].getElementsByClassName('ui-inputtext')[1] as HTMLInputElement).focus();
    }, 200);
  }



  onDeleteConfigCanceled() {
    console.log('AppComponent: onDeleteConfigCanceled()');
    this.showDeleteDialog = false;
  }



  onDeleteDemistoEndpointHidden() {
    this.showDemistoEndpointOpenDialog = true;
  }



  onDeleteConfigAccepted() {
    console.log('AppComponent: onDeleteConfigAccepted()');
    this.showDeleteDialog = false;
    let message = `Are you sure that you would like to delete the configuration${utils.sPlural(this.selectedDeleteConfigs)}: ${this.selectedDeleteConfigs.join(', ')} ?`;
    if (this.selectedDeleteConfigs.includes(this.loadedIncidentConfigName) ) {
      message = `Are you sure you want to delete the ACTIVE configuration '${this.loadedIncidentConfigName}' ?`;
    }
    this.confirmationService.confirm( {
      header: `Confirm Deletion`,
      message,
      accept: () => this.onDeleteConfigConfirmed(),
      icon: 'pi pi-exclamation-triangle'
    });
  }



  async onDeleteConfigConfirmed() {
    console.log('AppComponent: onDeleteConfigConfirmed()');

    this.selectedDeleteConfigs.forEach( async configName => {
      try {
        await this.fetcherService.deleteIncidentConfiguration(configName);
      }
      catch (error) {
        console.error(`onDeleteConfigConfirmed(): caught error whilst deleting configuration ${configName}`);
        return;
      }
    });

    if (this.selectedDeleteConfigs.includes(this.loadedIncidentConfigName)) {
      this.loadedIncidentConfigName = undefined;
      this.loadedIncidentConfigId = undefined;
    }

    // fetch fields config
    await this.getSavedIncidentConfigurations();
    this.messageWithAutoClear({severity: 'success', summary: 'Successful', detail: `Configuration${utils.sPlural(this.selectedDeleteConfigs)} ${this.selectedDeleteConfigs.join(', ')} was successfully deleted`});
    
    this.selectedDeleteConfigs = []; // reset selection
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



  onOpenCanceled() {
    console.log('AppComponent: onOpenCancelled()');
    this.showOpenDialog = false;
  }



  buildBulkConfigurationsToPushItems() {
    // console.log('AppComponent: buildBulkConfigurationsToPushItems()');
    const bulkConfigurationsToPush: BulkCreateConfigurationToPush[] = [];

    for (const incidentConfigName of Object.keys(this.bulkCreateSelections).sort(utils.sortArrayNaturally)) {
      const bulkCreateSelection = this.bulkCreateSelections[incidentConfigName];

      const jsonGroupsGood = bulkCreateSelection.jsonGroups.length !== 0;
      const endpointsGood = bulkCreateSelection.endpoints.length !== 0;
      const jsonRequired = this.savedIncidentConfigurations[incidentConfigName].requiresJson;

      if (jsonGroupsGood && endpointsGood && jsonRequired) {
        bulkConfigurationsToPush.push({
          incidentConfigName,
          jsonGroups: bulkCreateSelection.jsonGroups.join(', '),
          endpoints: bulkCreateSelection.endpoints.join(', ')
        });
      }
      else if (endpointsGood && !jsonRequired) {
        bulkConfigurationsToPush.push({
          incidentConfigName,
          endpoints: bulkCreateSelection.endpoints.join(', ')
        });
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
      const incidentConfigName = incidentConfig.value;
      selections[incidentConfigName] = {
        jsonGroups: [],
        endpoints: []
      };
      // selections[incidentConfigName]['jsonGroups'] = [];
      // selections[incidentConfigName]['endpoints'] = [];
    }
    /*for (const jsonGroup of Object.values(this.jsonGroupConfigurations)) {
      selections[jsonGroup.name]['jsonGroups'] = Object.assign(jsonGroup.jsonConfigs);
    }*/
    this.bulkCreateSelections = selections;
  }



  onBulkCreateClicked() {
    console.log('AppComponent: onBulkCreateClicked()');
    this.showBulkCreateDialog = true;
    this.buildBulkCreateGroups();
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      (document.getElementsByClassName('bulkCreateDialog')[0].getElementsByClassName('ui-inputtext')[1] as HTMLInputElement).focus();
    }, 200);
  }



  onBulkCreateCanceled() {
    console.log('AppComponent: onBulkCreateCanceled()');
    this.showBulkCreateDialog = false;
  }



  async onCreateBulkIncidents() {
    console.log('AppComponent: onCreateBulkIncidents()');
    /*
    this.showBulkCreateDialog = false;
    this.showBulkResultsDialog = true;
    this.changeDetector.detectChanges(); // trigger change detection

    this.bulkCreateResults = [];

    console.log('AppComponent: selectedBulkCreateConfigs:', this.selectedBulkCreateConfigs);
    */

    /*
    Steps to complete:

    1.  Load incident config
    2.  Test server
    3.  Load server fields
    4.  Check whether incident requires JSON file
    5.  Load JSON file, if needed
    6.  Check for keys that can't be pushed
    7.  Display them in a column
    8.  Push case with all other fields
    9.  Display results in a column
    */

    /*
    let createIncidentPromises: Promise<any>[] = [];
    let testResults = [];
    let serverFieldDefinitions = {};

    let serverTestPromises: Promise<any>[] = this.selectedBulkCreateEndpoints.map( async serverId => {
      console.log(`onCreateBulkIncidents(): Testing Demisto server ${serverId}`);
      const testResult  = await this.fetcherService.testDemistoEndpointById(serverId);

      testResults.push({serverId, testResult});

      if (testResult.success) {
        console.log(`Fetching field definitions from Demisto server ${serverId}`);
        const fetchedIncidentFieldDefinitions: FetchedIncidentField[] = await this.fetcherService.getIncidentFieldDefinitions(serverId);

        serverFieldDefinitions[serverId] = this.parseFetchedIncidentFieldDefinitions(fetchedIncidentFieldDefinitions);
      }
    } );

    await Promise.all(serverTestPromises);
    console.log('AppComponent: selectedBulkCreateConfigs: Server tests and field fetching complete');
    console.log('AppComponent: selectedBulkCreateConfigs: serverFieldDefinitions:', serverFieldDefinitions);

    for (const configName of this.selectedBulkCreateConfigs) {

      for (const result of testResults) {
        const testResult = result.testResult;
        const serverId = result.serverId;

        if (!testResult.success) {
          let error;
          if ('statusCode' in testResult) {
            error = `Server test failed with status code ${testResult.statusCode}: ${testResult.error}`;
          }
          else {
            error = `Server test failed with error: ${testResult.error}`;
          }
          this.bulkCreateResults.push({configName, serverId, success: false, error});
          this.changeDetector.detectChanges(); // update UI
          return;
        }

        console.log('AppComponent: onCreateBulkIncidents(): configName:', configName);
        let selectedConfig = this.savedIncidentConfigurations[configName];
        let skippedFields: string[] = [];

        let newIncident = {
          createInvestigation: selectedConfig.createInvestigation,
          serverId
        };

        Object.values(selectedConfig.incidentFieldsConfig).forEach( incidentFieldConfig => {
          const fieldName = incidentFieldConfig.shortName;
          if (!incidentFieldConfig.enabled) {
            // silently skip non-enabled fields
            return;
          }
          if (!(fieldName in serverFieldDefinitions[serverId])) {
            // skip fields which don't exist in Demisto config
            skippedFields.push(fieldName);
            return;
          }
          newIncident[fieldName] = incidentFieldConfig.value;
        });

        Object.values(selectedConfig.customFieldsConfig).forEach( incidentFieldConfig => {
          const fieldName = incidentFieldConfig.shortName;
          if (!('CustomFields' in newIncident)) {
            newIncident['CustomFields'] = {};
          }
          if (!incidentFieldConfig.enabled) {
            // silently skip non-enabled fields
            return;
          }
          if (!(fieldName in serverFieldDefinitions[serverId])) {
            // skip fields which don't exist in Demisto config
            skippedFields.push(fieldName);
            return;
          }
          newIncident['CustomFields'][fieldName] = incidentFieldConfig.value;
        });

        console.log('AppComponent: onCreateBulkIncidents(): newIncident:', newIncident);

        // now submit the incident
        createIncidentPromises.push((async () => {
          let res = await this.fetcherService.createDemistoIncident(newIncident);
          if (!res.success) {
            const error = res.statusMessage;
            this.bulkCreateResults.push({configName, serverId, success: false, error});
          }
          else {
            this.bulkCreateResults.push({configName, serverId, success: true, skippedFields, incidentId: res.id});
          }
          this.changeDetector.detectChanges(); // update UI
        })());
      }
    }

    await Promise.all(createIncidentPromises);
    console.log('AppComponent: onCreateBulkIncidents(): Incident creation complete');

    console.log('AppComponent: onCreateBulkIncidents(): bulkCreateResults:', this.bulkCreateResults);

    this.selectedBulkCreateConfigs = []; // reset selection
    this.selectedBulkCreateEndpoints = [];
    */
  }



  async onClickDemistoInvestigateUrl(incidentId: number, serverId: string) {
    console.log('AppComponent: onClickDemistoInvestigateUrl(): id:', incidentId);
    await this.fetcherService.createInvestigation(incidentId, serverId);
    const url = `${serverId}/#/incident/${incidentId}`;
    window.open(url, '_blank');
  }



  async testDemistoEndpointById(serverId: string): Promise<boolean> {
    const testRes = await this.fetcherService.testDemistoEndpointById(serverId);
    return testRes.success;
  }



  async switchCurrentDemistoEndpoint(serverId: string): Promise<void> {
    /*
    Called from onDemistoEndpointSelected()
    Tests selected server, then fetches the list of incident types, then fetches the field definitions.
    Sets currentDemistoEndpointName and currentDemistoEndpointInit
    */
    console.log('AppComponent: switchCurrentDemistoEndpoint(): serverId:', serverId);

    const currentDemistoEndpointNameReselected = this.currentDemistoEndpointName === serverId;
    const serverPreviouslySelected = this.currentDemistoEndpointName !== undefined;
    const incidentConfigIsLoaded = this.loadedIncidentConfigName !== undefined;

    if (currentDemistoEndpointNameReselected) {
      console.log('AppComponent: switchCurrentDemistoEndpoint(): currentDemistoEndpointName was re-selected.  Returning');
      return;
    }

    // this is the procedure to load a demistoEndpoint
    // test it and then 'load' it
    let testRes;
    try {
      testRes = await this.fetcherService.testDemistoEndpointById(serverId);
      this.currentDemistoEndpointName = serverId;
      this.currentDemistoEndpointInit = testRes.success;
    }
    catch (error) {
      this.currentDemistoEndpointInit = false;
      console.error('AppComponent: switchCurrentDemistoEndpoint(): Error loading Demisto endpoint:', testRes ? testRes : error);
    }

    if (this.currentDemistoEndpointInit) {
      
      // Refresh Demisto Incident Types
      try {
        await this.fetchIncidentTypes(this.currentDemistoEndpointName);
      }
      catch (error) {
        console.error('AppComponent: switchCurrentDemistoEndpoint(): Caught error fetching Demisto incident types:', error);
      }

      try {
        // Refresh Demisto Incident Fields
        await this.fetchIncidentFieldDefinitions(this.currentDemistoEndpointName);

        if (incidentConfigIsLoaded && serverPreviouslySelected) {
          const message = `Do you want to attempt to keep your current field values and selections, or revert them to their saved state?`;
          this.confirmationService.confirm( {
            message,
            icon: '',
            
            acceptLabel: 'Keep Current Values & Selections',
            // accept: () => this.freeformJsonUIComponent.updateChosenFieldLocks(),
            // accept: () => this.freeformJsonUIComponent.fieldLockCheck(),
            accept: () => {},
            
            rejectLabel: 'Revert to Saved State',
            // blow away the current config
            reject: () => this.freeformJsonUIComponent.onIncidentConfigOpened(this.savedIncidentConfigurations[this.loadedIncidentConfigName])
            
          });
        }

        else if (incidentConfigIsLoaded && !serverPreviouslySelected) {
          // an incident config is loaded and no server was previously selected, but now one is selected
          // destructive
          const selectedConfig = this.savedIncidentConfigurations[this.loadedIncidentConfigName];
          this.freeformJsonUIComponent.buildChosenFieldsFromConfig(selectedConfig);
          // this.freeformJsonUIComponent.updateChosenFieldLocks();
          // this.freeformJsonUIComponent.mergeLoadedFieldConfig(selectedConfig);
        }
        
      }
      catch (error) {
        console.error('AppComponent: switchCurrentDemistoEndpoint(): Caught error fetching Demisto incident fields:', error);
      }

    }

  }



  async onDemistoEndpointSelected() {
    console.log('AppComponent: onDemistoEndpointSelected(): selectedDemistoEndpointName:', this.selectedDemistoEndpointName);
    await this.switchCurrentDemistoEndpoint(this.selectedDemistoEndpointName);
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
  }



  onNewDemistoEndpointCanceled() {
    this.showNewDemistoEndpointDialog = false;
    this.showDemistoEndpointOpenDialog = true;
  }



  async onDeleteDemistoEndpointClicked() {
    console.log(`AppComponent: onDeleteDemistoEndpointClicked(): ${this.demistoEndpointToDelete}`);
    this.showDemistoEndpointOpenDialog = false;
    this.showDeleteDemistoEndpointDialog = true;
    this.demistoEndpointToDelete = this.selectedDemistoEndpointName;
  }



  async onDeleteDemistoEndpointConfirmed() {
    console.log('AppComponent: onDeleteDemistoEndpointConfirmed()');
    this.showDemistoEndpointOpenDialog = true;
    this.showDeleteDemistoEndpointDialog = false;
    let res;
    try {
      res = await this.fetcherService.deleteDemistoEndpoint(this.demistoEndpointToDelete);
      await this.refreshDemistoEndpoints();

      console.log('AppComponent: onDeleteDemistoEndpointConfirmed(): demistoEndpoints:', this.demistoEndpoints);

      // handle deletion of current Demisto endpoint
      if (this.demistoEndpointToDelete === this.currentDemistoEndpointName) {
        this.currentDemistoEndpointName = undefined;
        this.currentDemistoEndpointInit = false;
        // default endpoint logic will be handled by the server and refreshDemistoEndpoints()
      }
    }
    catch (error) {
      //  do something if there's an error
      console.error(`Caught error deleting ${this.demistoEndpointToDelete}`, res.error);
    }

    if (!this.currentDemistoEndpointInit) {
      // Clear Demisto Incident Field Definitions
      this.fetchedIncidentFieldDefinitions = undefined;
      this.freeformJsonUIComponent.updateChosenFieldLocks();
    }

  }



  async onSetDefaultDemistoEndpoint() {
    console.log('AppComponent: onSetDefaultDemistoEndpoint()');
    await this.fetcherService.setDefaultDemistoEndpoint(this.selectedDemistoEndpointName);
    await this.refreshDemistoEndpoints();
  }



  async onRefreshDemistoEndpoints() {
    console.log('AppComponent: onRefreshDemistoEndpoints()');
    await this.refreshDemistoEndpoints();
  }



  async onTestDemistoEndpoint() {
    console.log('AppComponent: onTestDemistoEndpoint(): selectedDemistoEndpointName:', this.selectedDemistoEndpointName);
    const success = await this.testDemistoEndpointById(this.selectedDemistoEndpointName);
    if (success) {
      this.messagesReplace( [{ severity: 'success', summary: 'Success', detail: `XSOAR endpoint ${this.selectedDemistoEndpointName} test success`}] );
    }
    else {
      this.messagesReplace( [{ severity: 'error', summary: 'Failure', detail: `XSOAR endpoint ${this.selectedDemistoEndpointName} test failure`}] );
    }
  }



  async onEditDemistoEndpoint() {
    console.log('AppComponent: onEditDemistoEndpoint()');
    this.newDemistoServerDialogMode = 'edit';
    this.showNewDemistoEndpointDialog = true;
    this.showDemistoEndpointOpenDialog = false;

    // get Demisto server details and stick them in
    // newDemistoServerUrl, newDemistoServerApiKey, newDemistoServerTrustAny
    const demistoServer = this.demistoEndpoints[this.selectedDemistoEndpointName];
    this.newDemistoServerUrl = demistoServer.url;
    this.newDemistoServerApiKey = '';
    this.newDemistoServerTrustAny = demistoServer.trustAny;
  }



  async onDemistoEndpointUpdated(updatedServerUrl: string) {
    console.log('AppComponent: onDemistoEndpointUpdated()');

    this.showNewDemistoEndpointDialog = false;
    this.showDemistoEndpointOpenDialog = true;

    const oldSelectedDemistoApiName = this.selectedDemistoEndpointName;

    const currentDemistoEndpointUpdated = oldSelectedDemistoApiName === this.currentDemistoEndpointName;

    let res: any;
    if (this.newDemistoServerApiKey === '') {
      res = await this.fetcherService.updateDemistoEndpoint(this.selectedDemistoEndpointName, this.newDemistoServerUrl, this.newDemistoServerTrustAny );
    }
    else {
      res = await this.fetcherService.updateDemistoEndpoint(this.selectedDemistoEndpointName, this.newDemistoServerUrl, this.newDemistoServerTrustAny, this.newDemistoServerApiKey);
    }

    if (oldSelectedDemistoApiName === this.currentDemistoEndpointName) {
      // it's necessary to fix currentDemistoEndpointName if it has been edited
      // before running refreshDemistoEndpoints()
      this.currentDemistoEndpointName = this.newDemistoServerUrl;
    }

    // refresh servers
    await this.refreshDemistoEndpoints();

    if (currentDemistoEndpointUpdated && this.currentDemistoEndpointInit) {
      // Refresh Demisto Incident Fields, if current server is initialised
      try {
        await this.fetchIncidentFieldDefinitions(this.currentDemistoEndpointName);

        if (this.loadedIncidentConfigName) {
          const message = `Do you want to attempt to keep your current field values and selections, or reset them to their saved state?`;
          this.confirmationService.confirm( {
            message,
            icon: '',

            acceptLabel: 'Keep Current Values & Selections',
            accept: () => this.freeformJsonUIComponent.updateChosenFieldLocks(),

            rejectLabel: 'Reset to Saved State',
            reject: () => this.freeformJsonUIComponent.buildChosenFieldsFromConfig(this.savedIncidentConfigurations[this.loadedIncidentConfigName])
          });
        }
      }
      catch (error) {
        console.error('AppComponent: onDemistoEndpointUpdated(): Caught error fetching Demisto incident fields:', error);
      }

      // Refresh Demisto Incident Types
      try {
        await this.fetchIncidentTypes(this.currentDemistoEndpointName);
      }
      catch (error) {
        console.error('AppComponent: onDemistoEndpointUpdated(): Caught error fetching Demisto incident types:', error);
      }
    }

    this.newDemistoServerUrl = '';
    this.newDemistoServerApiKey = '';
    this.newDemistoServerTrustAny = true;
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
          this.loadedIncidentConfigName = undefined;
          this.loadedIncidentConfigId = undefined;
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
      this.loadedIncidentConfigName = undefined;
      this.loadedIncidentConfigId = undefined;
      this.loadedIncidentConfigName = undefined;
    }
  }



  async getSavedIncidentConfigurations() {
    // Get Fields Configurations
    try {
      this.savedIncidentConfigurations = await this.fetcherService.getSavedIncidentConfigurations();
      console.log('AppComponent: getSavedIncidentConfigurations(): savedIncidentConfigurations:', this.savedIncidentConfigurations);
      this.savedIncidentConfigItems = this.buildFieldsConfigItems(this.savedIncidentConfigurations);
      if (this.loadedIncidentConfigName) {
        this.loadedIncidentConfigId = this.savedIncidentConfigurations[this.loadedIncidentConfigName].id;
      }
    }
    catch (error) {
      console.error('AppComponent: getSavedIncidentConfigurations(): Caught error fetching fields configuration:', error);
    }
  }



  selectItemsSort(a: SelectItem, b: SelectItem): number {
    return utils.sortArrayNaturally(a.label, b.label);
  }



  buildFieldsConfigItems(configs: IncidentConfigs): SelectItem[] {
    let items: SelectItem[] = Object.values(configs).map( (config: IncidentConfig) =>
      ({ label: config.name, value: config.name })
    );
    return items.sort(this.selectItemsSort);
  }



  async onSavedIncidentConfigurationsChanged(newIncidentConfigName) {
    // Update Fields Configurations
    this.loadedIncidentConfigName = newIncidentConfigName;
    await this.getSavedIncidentConfigurations();
  }


  onLoadFromDemistoClicked() {
    this.showLoadFromDemistoDialog = true;
    if (this.currentDemistoEndpointName !== '') {
      this.demistoEndpointToLoadFrom = this.currentDemistoEndpointName;
    }
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      document.getElementsByClassName('loadFromDemistoDialog')[0].getElementsByTagName('input')[0].focus();
    }, 100);
  }



  onLoadFromDemistoCanceled() {
    this.showLoadFromDemistoDialog = false;
  }



  async loadFromDemisto() {
    console.log('AppComponent: loadFromDemistoAccepted()');
    this.showJsonMappingUI = true;
    this.loadDefaultChosenFields = false;
    this.loadedIncidentConfigName = undefined;
    this.loadedIncidentConfigId = undefined;
    this.changeDetector.detectChanges();
    
    const res = await this.freeformJsonUIComponent.loadFromDemisto(this.demistoIncidentToLoad, this.demistoEndpointToLoadFrom);
    if (res) {
      this.demistoEndpointToLoadFrom = '';
      this.demistoIncidentToLoad = '';
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
      jsonGroupDialogSelections[jsonGroup.name] = Object.assign(jsonGroup.jsonConfigs);
    }
    this.jsonGroupDialogSelections = jsonGroupDialogSelections;
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
      jsonConfigs: []
    };
    this.showNewJsonConfigDialog = false;
    
    try {
      await this.fetcherService.saveNewJsonGroupConfiguration(newJsonGroupConfig);
      await this.getSavedJsonGroupConfigurations();
      this.jsonGroupSelection_JsonGroupDialog = this.newJsonGroupConfigName;
      this.jsonGroupDialogSelections[this.newJsonGroupConfigName] = [];
    }
    catch(error) {
      console.error('AppComponent: onNewJsonGroupAccepted(): Caught error saving JSON Groups configurations:', error);
      return;
    }
  }



  async onDeleteJsonGroupConfirmed(jsonGroupToDelete: string) {
    console.log(`AppComponent: onDeleteJsonGroupConfirmed(): jsonGroupToDelete: ${jsonGroupToDelete}`);
    try {
      await this.fetcherService.deleteJsonGroupConfiguration(jsonGroupToDelete);
      await this.getSavedJsonGroupConfigurations();
      if (jsonGroupToDelete === this.jsonGroupSelection_JsonGroupDialog) {
        this.jsonGroupSelection_JsonGroupDialog = undefined;
      }
      delete this.jsonGroupDialogSelections[jsonGroupToDelete];
    }
    catch(error) {
      console.error(`AppComponent: onDeleteJsonGroupConfirmed(): Caught error deleting JSON Group configuration '${jsonGroupToDelete}':`, error);
      return;
    }
  }



  onDeleteJsonGroupClicked() {
    console.log(`AppComponent: onDeleteJsonGroupClicked(): ${this.jsonGroupSelection_JsonGroupDialog}`);
    this.showJsonGroupDeleteDialog = true;
    // this.showJsonGroupsDialog = false;
    const jsonGroupToDelete = this.jsonGroupSelection_JsonGroupDialog;
    this.confirmationService.confirm( {
      header: `Confirm Deletion`,
      message: `Are you sure that you would like to delete JSON group '${jsonGroupToDelete}'`,
      accept: () => this.onDeleteJsonGroupConfirmed(this.jsonGroupSelection_JsonGroupDialog),
      icon: 'pi pi-exclamation-triangle'
    });
  }



  async onAcceptJsonGroupChanges() {
    console.log(`AppComponent: onAcceptJsonGroupChanges()`);
    for (const jsonGroupName of Object.keys(this.jsonGroupDialogSelections)) {
      const jsonSelections = this.jsonGroupDialogSelections[jsonGroupName];
      // console.log(`jsonSelection:`, jsonSelections);
      const groupConfig: JsonGroup = {
        name: jsonGroupName,
        jsonConfigs: jsonSelections
      };
      await this.fetcherService.saveJsonGroupConfiguration(groupConfig);
    }
    await this.getSavedJsonGroupConfigurations();
    this.showJsonGroupsDialog = false;
  }



  onSelectAllJsonConfigurations() {
    console.log(`AppComponent: onSelectAllJsonConfigurations()`);
    this.jsonGroupDialogSelections[this.jsonGroupSelection_JsonGroupDialog] = Object.assign(this.savedJsonConfigurations, []);
  }



  onUnselectAllJsonConfigurations() {
    console.log(`AppComponent: onUnselectAllJsonConfigurations()`);
    this.jsonGroupDialogSelections[this.jsonGroupSelection_JsonGroupDialog] = [];
  }




}
