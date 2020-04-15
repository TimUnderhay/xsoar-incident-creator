import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { NgForm } from '@angular/forms';
import { FetcherService } from './fetcher-service';
import { DemistoAPI, DemistoAPIEndpoints } from './types/demisto-properties';
import { User } from './types/user';
import { ApiStatus } from './types/api-status';
import { SelectItem } from 'primeng/api';
import { IncidentField, IncidentFields } from './types/incident-fields';
import { FetchedIncidentType } from './types/fetched-incident-types';
import { FetchedIncidentField, FetchedIncidentFieldDefinitions } from './types/fetched-incident-field';
import { FieldConfig, FieldsConfig, IncidentFieldsConfig } from './types/fields-config';
import { ConfirmationService } from 'primeng/api';
import { PMessageOption } from './types/message-options';
import { BulkCreateResult } from './types/bulk-create-result';
import { InvestigationFields as investigationFields } from './investigation-fields';

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

  loggedInUser: User;

  // API Properties
  demistoApiEndpoints: DemistoAPIEndpoints = {};
  get demistoApiEndpointsLen() { return Object.keys(this.demistoApiEndpoints).length; }
  defaultDemistoApiName: string;
  currentDemistoApiName: string;
  currentServerApiInit = false;

  // Incident Properties
  parsedIncidentJson: any; // parsed incident json.
  incidentFields: IncidentFields; // the fields of our imported or loaded JSON
  customFields: IncidentFields; // the custom fields of our imported or loaded json
  fetchedIncidentFieldDefinitions: FetchedIncidentFieldDefinitions; // the field definitions loaded from Demisto
  createInvestigation = true;
  fetchedIncidentTypes: FetchedIncidentType[]


  // For PrimeNG
  messages: PMessageOption[] = [];
  messagesClearTimeout: ReturnType<typeof setTimeout> = null;
  demistoApiEndpointsOptions: SelectItem[]; // holds list of API endpoints for PrimeNG
  fieldsConfigOptions: SelectItem[] = []; // dropdown/listbox options object for all field configs

  // Saved Incident Configurations
  savedIncidentConfigurations: FieldsConfig = {};
  get savedIncidentConfigurationsLen(): number {
    // returns the number of saved field configs
    return Object.keys(this.savedIncidentConfigurations).length;
  }
  loadedIncidentConfigName: string; // must clear when loaded from json or when current config is deleted
  loadedIncidentConfigId: string; // must clear when loaded from json or when current config is deleted

  // Save as dialog
  showSaveAsDialog = false;
  canSubmitSaveAs = false;
  saveAsConfigName = ''; // for text label

  // Delete dialog
  showDeleteDialog = false;
  selectedDeleteConfigs: string[] = [];
  confirmDialogHeader = '';

  // Open dialog
  showOpenDialog = false;
  selectedOpenConfig = '';

  // Bulk create dialog
  showBulkCreateDialog = false;
  selectedBulkCreateConfigs: string[] = [];
  selectedBulkCreateApiServers: string[] = [];

  // Bulk results dialog
  showBulkResultsDialog = false;
  bulkCreateResults: BulkCreateResult[] = [];

  // Select Demisto api server dialog
  showDemistoApiServerOpenDialog = false;
  selectedDemistoApiName: string;

  // New / edit Demisto api server dialog
  showNewDemistoApiServerDialog = false;
  newDemistoServerUrl = '';
  newDemistoServerApiKey = '';
  newDemistoServerTrustAny = true;
  get newDemistoServerSaveDisabled() {
    if (this.newDemistoServerDialogMode === 'new') {
      return this.newDemistoServerUrl in this.demistoApiEndpoints;
    }
    // edit mode
    return this.selectedDemistoApiName !== this.newDemistoServerUrl && this.newDemistoServerUrl in this.demistoApiEndpoints;
  }
  newDemistoServerDialogMode: DemistoServerEditMode = 'new';
  get newEditTestButtonDisabled(): boolean {
    if (this.newDemistoServerDialogMode === 'new') {
      return !this.newDemistoServerUrl || !this.newDemistoServerApiKey;
    }
    // edit mode
    return !this.newDemistoServerUrl;
  }

  // Delete Demisto api server dialog
  showDeleteDemistoApiServerDialog = false;
  demistoApiServerToDelete: string;


  get saveAsButtonDisabled(): boolean {
    return this.saveAsConfigName in this.savedIncidentConfigurations;
  }

  // Import from Demisto dialog
  showLoadFromDemistoDialog = false;
  demistoIncidentToLoad = '';
  demistoApiToLoadFrom = '';
  get importFromDemistoAcceptDisabled(): boolean {
    return this.demistoApiToLoadFrom === '' || this.demistoIncidentToLoad.match(/^\d+$/) === null;
  }

  // Json Mapping UI
  showJsonMappingUI = false;
  loadedJsonMappingConfigName: string; // must clear when a new config is created, when a config is opened, or when the current config is deleted
  loadedJsonMappingConfigId: string; // must clear when a new config is created, when a config is opened, or when the current config is deleted



  async ngOnInit() {
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

    // API Init
    await this.demistoApiInit(); // sets currentServerApiInit

    if (this.currentServerApiInit) {
      // Demisto Incident Fields
      try {
        await this.fetchIncidentFieldDefinitions(this.currentDemistoApiName);
      }
      catch (error) {
        console.error('AppComponent: ngOnInit(): Caught error fetching Demisto incident fields:', error);
      }
      // Demisto Incident Types
      try {
        await this.fetchIncidentTypes(this.currentDemistoApiName);
      }
      catch (error) {
        console.error('AppComponent: ngOnInit(): Caught error fetching Demisto incident types:', error);
      }
    }

    if (this.demistoApiEndpointsLen === 0) {
      setTimeout(() => this.onNewDemistoApiServer(), 0);
    }

    // Fields Configurations
    try {
      this.savedIncidentConfigurations = await this.getAllFieldConfigurations();
      console.log('AppComponent: ngOnInit(): savedIncidentConfigurations:', this.savedIncidentConfigurations);
      this.fieldsConfigOptions = this.buildFieldsConfigOptions(this.savedIncidentConfigurations);
    }
    catch (error) {
      console.error('AppComponent: ngOnInit(): Caught error fetching fields configuration:', error);
    }

    // Fetch Sample Incident -- Comment out before committing to master
    // await this.getSampleIncident();
  }



  async getAllFieldConfigurations() {
    return this.fetcherService.getAllFieldConfigurations();
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



  async demistoApiInit() {
    /*
    Loads the list of Demisto API server configs.
    Gets the default API server
    If there are no server configs, set currentServerApiInit = false and display a message and do nothing else
    If the server as serts that a default server is defined:
      Set defaultDemistoApiName
      Set currentDemistoApiName
      Test the current/default API server.
        If successful, display a success message
        If unsuccessful, display a failure message
      Finally, build the options for the server selection PrimeNG widget from our updated server list

    Called only from ngOnInit()
    */
    console.log('demistoApiInit()');
    try {

      this.demistoApiEndpoints = await this.fetcherService.getDemistoApi(); // obtain saved Demisto API endpoints
      console.log('demistoApiInit(): demistoApiEndpoints:', this.demistoApiEndpoints);

      const defaultApiResult = await this.fetcherService.getDemistoDefaultApi();
      console.log('demistoApiInit(): defaultApiResult:', defaultApiResult);

      const configsAreEmpty = this.demistoApiEndpointsLen === 0;
      const defaultDemistoApiDefinedButMissing = !configsAreEmpty && defaultApiResult.defined && !(defaultApiResult.serverId in this.demistoApiEndpoints);
      const defaultDemistoApiIsDefined = !configsAreEmpty && defaultApiResult.defined && defaultApiResult.serverId in this.demistoApiEndpoints;

      if (configsAreEmpty) {
        this.currentServerApiInit = false;
        this.currentDemistoApiName = undefined;
        this.defaultDemistoApiName = undefined;
        this.messageWithAutoClear( { severity: 'info', summary: 'Info', detail: `No Demisto servers are defined.  Configure one below`} );
      }

      else if (defaultDemistoApiDefinedButMissing) {
        this.messageWithAutoClear( { severity: 'error', summary: 'Error', detail: `The default Demisto server ${this.defaultDemistoApiName} is not defined.  This shouldn't happen.`} );
        this.currentServerApiInit = false;
        this.currentDemistoApiName = undefined;
        this.defaultDemistoApiName = undefined;
      }

      else if (defaultDemistoApiIsDefined) {

        this.defaultDemistoApiName = defaultApiResult.serverId;
        this.currentDemistoApiName = this.defaultDemistoApiName;

        let testRes = await this.fetcherService.testApiServer(this.defaultDemistoApiName);

        this.currentServerApiInit = testRes.success;

        if (this.currentServerApiInit) {
          this.messageWithAutoClear( { severity: 'success', summary: 'Success', detail: `XSOAR API communication to ${this.currentDemistoApiName} is initialised`});
        }
        else {
          this.messageWithAutoClear( { severity: 'error', summary: 'Failure', detail: `XSOAR API communication is not initialised to ${this.currentDemistoApiName}`} );
        }

        this.buildDemistoApiConfigOptions();
      }


    }
    catch (err) {
      console.log('Caught error fetching Demisto server API status:', err);
    }
  }



  buildDemistoApiConfigOptions() {
    console.log('buildDemistoApiConfigOptions()');
    this.demistoApiEndpointsOptions = Object.keys(this.demistoApiEndpoints).map( key => ({ value: key, label: this.defaultDemistoApiName && key === this.defaultDemistoApiName ? `${key} (default)` : key}
    ) );
    console.log('buildDemistoApiConfigOptions(): demistoApiEndpointsOptions:', this.demistoApiEndpointsOptions);
  }



  async refreshDemistoApi(setDefault = false) {
    /*
    Called from onNewDemistoApiServerSaved(), onDeleteDemistoApiServerConfirmed(), onSetDefaultDemistoApiServer(), onRefreshDemistoApiServers(), and onDemistoApiServerUpdated()

    Loads the list of Demisto API server configs.
    Gets the default API server, as it may have changed.
    If there are no configs, set currentServerApiInit = false and currentDemistoApiName = undefined
    If the server says the default Demisto API is defined, set defaultDemistoApiName to be the default Demisto API
    if the current server no longer exists after the refresh, then set currentDemistoApiName to undefined
    If a server is selected (currentDemistoApiName), test it and save result to currentServerApiInit
    Finally, build the options for the server selection PrimeNG widget from our updated server list

    setDefault = true means that demistoDefaultApi should be set automatically if this is the first server to be added, typically only upon a create or delete operation.  Only used when called from onNewDemistoApiServerSaved()
    */

    console.log('AppComponent: refreshDemistoApi()');
    const lastdemistoApiEndpointsLen = this.demistoApiEndpointsLen;
    const lastCurrentDemistoApiName = this.currentDemistoApiName;

    this.demistoApiEndpoints = await this.fetcherService.getDemistoApi(); // obtain saved Demisto API endpoints

    // console.log('refreshDemistoApi(): demistoApiEndpoints:', this.demistoApiEndpoints);

    const firstDefinedServer = setDefault && lastdemistoApiEndpointsLen === 0 && this.demistoApiEndpointsLen !== 0;

    if (firstDefinedServer) {
      // if no api servers were previously defined, make the first API to be added, the default
      const firstServerId = Object.keys(this.demistoApiEndpoints)[0];
      await this.fetcherService.setDemistoDefaultApi(firstServerId);
      this.switchCurrentDemistoApiServer(firstServerId);
    }

    // Gets the default API server, as it may have changed.
    const defaultApiResult = await this.fetcherService.getDemistoDefaultApi();

    const configsAreEmpty = this.demistoApiEndpointsLen === 0;

    const defaultDemistoApiIsDefined = !configsAreEmpty && defaultApiResult.defined && defaultApiResult.serverId in this.demistoApiEndpoints;

    if (configsAreEmpty) {
      this.currentServerApiInit = false;
      this.currentDemistoApiName = undefined;
    }
    else if (defaultDemistoApiIsDefined) {
      this.defaultDemistoApiName = defaultApiResult.serverId;
    }

    const currentApiStillDefined = this.currentDemistoApiName && this.currentDemistoApiName in this.demistoApiEndpoints; // make sure the currently selected API hasn't been deleted

    if (!currentApiStillDefined) {
      // clear selected api
      this.currentDemistoApiName = undefined;
    }

    if (this.currentDemistoApiName) {
      // test the currently selected server
      let testRes = await this.fetcherService.testApiServer(this.currentDemistoApiName);

      this.currentServerApiInit = testRes.success;
    }

    this.buildDemistoApiConfigOptions();

    /*
    const currentDemistoServerChanged = this.currentServerApiInit && lastCurrentDemistoApiName !== this.currentDemistoApiName; // the current api server may have changed if it was edited

    if (currentDemistoServerChanged) {
      // Refresh Demisto Incident Fields
      try {
        await this.fetchIncidentFieldDefinitions(this.currentDemistoApiName);
      }
      catch (error) {
        console.error('AppComponent: refreshDemistoApi(): Caught error fetching Demisto incident fields:', error);
      }
    }
    */
  }



  parseFetchedIncidentFieldDefinitions(fetchedIncidentFieldDefinitions: FetchedIncidentField[]): FetchedIncidentFieldDefinitions {
    let tmpFields: FetchedIncidentFieldDefinitions = {};
    fetchedIncidentFieldDefinitions.forEach( (field: FetchedIncidentField) => {
      const shortName = field.cliName;
      tmpFields[shortName] = field;
    });
    return tmpFields;
  }



  async fetchIncidentFieldDefinitions(serverId): Promise<boolean> {
    /*
    Called from ngOnInit(), onReloadFieldDefinitions(), refreshDemistoApi(), switchCurrentDemistoApiServer()
    Fetches incident field definitions from Demisto
    Saves them to fetchedIncidentFieldDefinitions
    */
    console.log('fetchIncidentFieldDefinitions()');
    try {
      const fetchedIncidentFieldDefinitions: FetchedIncidentField[] = await this.fetcherService.getIncidentFieldDefinitions(serverId);

      this.fetchedIncidentFieldDefinitions = this.parseFetchedIncidentFieldDefinitions(fetchedIncidentFieldDefinitions);

      console.log('fetchedIncidentFieldDefinitions:', this.fetchedIncidentFieldDefinitions);
      return true;

      // for identification purposes, output all the field types
      /*let fieldTypes = fetchedIncidentFieldDefinitions.reduce( (result: string[], field: FetchedIncidentField) => {
        if (!result.includes(field.type)) {
          result.push(field.type);
        }
        return result;
      }, []);
      console.log('fieldTypes:', fieldTypes);*/
    }
    catch (err) {
      console.log('Caught error fetching Demisto incident fields:', err);
      return false;
    }
  }



  async fetchIncidentTypes(serverId): Promise<boolean> {
    /*
    Called from ngOnInit()
    Fetches incident types from Demisto
    */
    console.log('fetchIncidentTypes()');
    try {
      const fetchedIncidentTypes: FetchedIncidentType[] = await this.fetcherService.getIncidentTypes(serverId);
      console.log('fetchIncidentTypes(): ', fetchedIncidentTypes);
      this.fetchedIncidentTypes = fetchedIncidentTypes;

    }
    catch (err) {
      console.log('Caught error fetching Demisto incident types:', err);
      return false;
    }
  }



  async testDemistoApi(url: string, apiKey: string, trustAny: boolean): Promise<boolean> {
    // performs an ad hoc test of a Demisto API endpoint
    console.log('testDemistoApi()');
    let testResult: string;
    const useServerId = this.newDemistoServerDialogMode === 'edit' && this.newDemistoServerApiKey === '';
    try {
      let result;
      if (!useServerId) {
        result = await this.fetcherService.testApiServerAdhoc({url, apiKey, trustAny});
      }
      else {
        result = await this.fetcherService.testApiServerAdhoc({url, trustAny, serverId: this.selectedDemistoApiName});
      }
      if (this.messagesClearTimeout) {
        clearTimeout(this.messagesClearTimeout);
        this.messagesClearTimeout = null;
      }
      console.log('testCredentials() result:', result);
      if ( 'success' in result && result.success ) {
        // test successful
        testResult = 'Test successful';
        // this.currentServerApiInit = true;
        this.messageWithAutoClear({ severity: 'success', summary: 'Success', detail: 'XSOAR API communication test success'});
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
          detail: `XSOAR API communication is not initialised. ${testResult}`
        }];
        // this.currentServerApiInit = false;
        return false;
      }
    }
    catch (error) {
      testResult = `Test failed with error: ${error.message || error}`;
      this.messages = [{
        severity: 'error',
        summary: 'Failure',
        detail: `XSOAR API communication is not initialised. ${testResult}`
      }];
      // this.currentServerApiInit = false;
      return false;
    }
  }



  buildCustomFields(customFields) {
    /*
    Called from buildIncidentFields()
    */
    // console.log('buildCustomFields(): customFields:', customFields);
    let tmpCustomFields: IncidentFields = {};
    Object.keys(customFields).forEach( shortName => {
      let value = customFields[shortName];
      let tmpField: IncidentField = {
        shortName,
        value,
        originalValue: value,
        enabled: false,
        custom: true
      };
      if (this.fetchedIncidentFieldDefinitions && shortName in this.fetchedIncidentFieldDefinitions) {
        tmpField.longName = this.fetchedIncidentFieldDefinitions[shortName].name;
        tmpField.locked = false;
        tmpField.fieldType = this.fetchedIncidentFieldDefinitions[shortName].type;
        if (['attachments'].includes(tmpField.fieldType) ) {
          tmpField.locked = true;
          tmpField.lockedReason = 'This field type is not supported for import';
        }
      }
      else if (!this.fetchedIncidentFieldDefinitions) {
        // no fields currently defined
        tmpField.locked = true;
        tmpField.fieldType = 'undefined';
        tmpField.lockedReason = 'No fields are currently available from Demisto';
      }
      else {
        // custom field isn't defined in Demisto
        tmpField.locked = true;
        tmpField.fieldType = 'undefined';
        tmpField.lockedReason = 'This field cannot be imported as it is not defined in Demisto';
      }
      tmpCustomFields[shortName] = tmpField;
    });
    this.customFields = tmpCustomFields;
    console.log('buildCustomFields(): customFields:', this.customFields);
  }



  buildIncidentFields(incidentJson) {
    /*
    Called from onIncidentJsonUploaded(), getSampleIncident(), onConfigOpened()
    */
    console.log('buildIncidentFields(): incidentJson:', incidentJson);
    let incidentFields: IncidentFields = {};
    let skippedInvestigationFields = [];
    Object.keys(incidentJson).forEach( shortName => {
      // console.log('shortName:', shortName);
      let value = incidentJson[shortName];

      if (investigationFields.includes(shortName)) {
        skippedInvestigationFields.push(shortName);
        return;
      }

      if (shortName === 'CustomFields') {
        this.buildCustomFields(incidentJson.CustomFields);
        return;
      }

      if (this.fetchedIncidentFieldDefinitions && !(shortName in this.fetchedIncidentFieldDefinitions)) {
        console.error(`Incident field not found: ${shortName}.  It's probably an investigation field and this can safely be ignored.`);
        return;
      }

      if (!this.fetchedIncidentFieldDefinitions) {
        incidentFields[shortName] = {
          shortName,
          value,
          originalValue: value,
          enabled: false,
          custom: false,
          locked: true,
          fieldType: 'undefined',
          lockedReason: 'No fields are currently available from Demisto'
        };
        return;
      }

      incidentFields[shortName] = {
        shortName,
        longName: this.fetchedIncidentFieldDefinitions[shortName].name,
        enabled: false,
        locked: false,
        value,
        originalValue: value,
        fieldType: this.fetchedIncidentFieldDefinitions[shortName].type,
        custom: false
      };

    });
    this.incidentFields = incidentFields;
    console.log(`Skipped investigation fields:`, skippedInvestigationFields);
    console.log('buildIncidentFields(): incidentFields:', this.incidentFields);
  }



  mergeAndKeepLoadedFieldConfig() {
    console.log('mergeAndKeepLoadedFieldConfig()');
    // Attempts to keep current field selections and values
    const incidentFieldsDefined = this.incidentFields;
    const customFieldsDefined = this.customFields;

    if (!incidentFieldsDefined) {
      console.log('mergeAndKeepLoadedFieldConfig(): incidentFields not defined.  Returning');
      return;
    }

    let fieldsToProcess = [this.incidentFields];

    if (customFieldsDefined) {
      fieldsToProcess.push(this.customFields);
    }

    fieldsToProcess.forEach( dataSet => {

      Object.values(dataSet).forEach( field => {
        const shortName = field.shortName;

        const noFieldDefinitions = !this.fetchedIncidentFieldDefinitions;
        const typeNotSupported = ['attachments'].includes(field.fieldType);
        const fieldFoundInFieldDefinitions = !noFieldDefinitions && shortName in this.fetchedIncidentFieldDefinitions;

        if (noFieldDefinitions) {
          // no fields currently defined
          field.locked = true;
          field.fieldType = 'undefined';
          // field.fieldType = field.fieldType;
          field.lockedReason = 'No fields are currently available from Demisto';
        }
        else if (typeNotSupported) {
          field.locked = true;
          field.lockedReason = 'This field type is not supported for import';
        }
        else if (!fieldFoundInFieldDefinitions) {
          // custom field isn't defined in Demisto
          field.locked = true;
          field.fieldType = 'undefined';
          field.lockedReason = 'This field cannot be imported as it is not defined in Demisto';
        }
        else if (fieldFoundInFieldDefinitions) {
          field.fieldType = this.fetchedIncidentFieldDefinitions[shortName].type;
        }

        field.enabled = !field.locked ? field.enabled : false;
      });
    });
    this.incidentFields = JSON.parse(JSON.stringify(this.incidentFields)); // hack deep copy to trigger change detection
    this.customFields = JSON.parse(JSON.stringify(this.customFields)); // hack deep copy to trigger change detection
  }



  mergeLoadedFieldConfig(savedIncidentConfig: FieldConfig) {
    /*
    Takes a saved incident field configuration and compares it with the config from the current API server.
    Called from onConfigOpened(), switchCurrentDemistoApiServer(), onDemistoApiServerUpdated()
    Does not need to be called from onIncidentJsonUploaded() because uploaded JSON...
    doesn't contain info on which fields to enable
    */

    Object.values(savedIncidentConfig.incidentFieldsConfig).forEach( field => {
      const shortName = field.shortName;
      if (!this.incidentFields[shortName].locked) {
        this.incidentFields[shortName].enabled = field.enabled;
      }
      this.incidentFields[shortName].value = field.value;
      this.incidentFields[shortName].originalValue = field.value;
    } );

    Object.values(savedIncidentConfig.customFieldsConfig).forEach( field => {
      const shortName = field.shortName;
      if (!this.customFields[shortName].locked) {
        this.customFields[shortName].enabled = field.enabled;
      }
      this.customFields[shortName].value = field.value;
      this.customFields[shortName].originalValue = field.value;
    } );

    console.log('mergeLoadedFieldConfig(): incidentFields:', this.incidentFields);
    // this.incidentFields = JSON.parse(JSON.stringify(this.incidentFields)); // hack deep copy to trigger change detection
    // this.customFields = JSON.parse(JSON.stringify(this.customFields)); // hack deep copy to trigger change detection
  }



  onIncidentJsonUploaded(data: { files: File }, uploadRef) {
    let file = data.files[0];
    console.log('onIncidentJsonUploaded(): file:', file);

    try {
      let reader = new FileReader();
      reader.onloadend = (error: any) => {
        this.parsedIncidentJson = JSON.parse(reader.result as string);
        console.log('onIncidentJsonUploaded(): parsedIncidentJson:', this.parsedIncidentJson);
        this.buildIncidentFields(this.parsedIncidentJson);
        this.loadedIncidentConfigName = undefined;
        this.loadedIncidentConfigId = undefined;
        this.createInvestigation = true;

        uploadRef.clear(); // allow future uploads
      };

      reader.readAsText(data.files[0]); // kick off the read operation (calls onloadend())
    }
    catch (error) {
      console.error('onIncidentJsonUploaded(): Error parsing uploaded file:', error);
    }
  }



  /*onFreeformJsonUploaded(data: { files: File }, uploadRef) {
    let file = data.files[0];
    console.log('onFreeformJsonUploaded(): file:', file);

    try {
      let reader = new FileReader();
      reader.onloadend = (error: any) => {
        this.parsedIncidentJson = JSON.parse(reader.result as string);
        console.log('onFreeformJsonUploaded(): parsedIncidentJson:', this.parsedIncidentJson);
        this.buildIncidentFields(this.parsedIncidentJson);
        this.loadedIncidentConfigName = undefined;
        this.loadedIncidentConfigId = undefined;
        this.createInvestigation = true;

        uploadRef.clear(); // allow future uploads
      };

      reader.readAsText(data.files[0]); // kick off the read operation (calls onloadend())
    }
    catch (error) {
      console.error('onFreeformJsonUploaded(): Error parsing uploaded file:', error);
    }
  }*/



  async getSampleIncident() {
    let res = await this.fetcherService.getSampleIncident();
    this.parsedIncidentJson = res;
    console.log('getSampleIncident(): parsedIncidentJson:', this.parsedIncidentJson);
    this.buildIncidentFields(this.parsedIncidentJson);
  }



  isJsonValid(value: any) {
    try {
      JSON.stringify(value);
      return true;
    }
    catch {
      return false;
    }
  }



  onSaveAsClicked() {
    console.log('onSaveAsClicked()');
    this.showSaveAsDialog = true;
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      document.getElementsByClassName('saveAsDialog')[0].getElementsByTagName('input')[0].focus();
    }, 100);
  }



  buildFieldConfig(fields: IncidentFields): IncidentFieldsConfig {
    let res: IncidentFieldsConfig = {};
    Object.values(fields).forEach( field => {
      const name = field.shortName;
      res[name] = {
        shortName: field.shortName,
        enabled: field.enabled,
        value: field.value
      };
    });
    return res;
  }



  buildFieldsConfigOptions(configs: FieldsConfig): SelectItem[] {
    let items: SelectItem[] = Object.values(configs).map( (config: FieldConfig) =>
      ({ label: config.name, value: config.name })
    );
    return items;
  }



  async onSaveAsAccepted() {
    console.log('onSaveAsAccepted()');
    let config: FieldConfig = {
      name: this.saveAsConfigName,
      incident: this.parsedIncidentJson,
      incidentFieldsConfig: this.buildFieldConfig(this.incidentFields),
      customFieldsConfig: this.buildFieldConfig(this.customFields),
      createInvestigation: this.createInvestigation
    };
    try {
      let res = await this.fetcherService.saveNewFieldConfiguration(config);
      this.messageWithAutoClear({severity: 'success', summary: 'Successful', detail: `Configuration '${this.saveAsConfigName}' has been saved`});
      this.loadedIncidentConfigName = this.saveAsConfigName;
      this.saveAsConfigName = '';
    }
    catch (error) {
      console.error('onSaveAsAccepted(): caught error saving field config:', error);
      return;
    }

    // Fields Configurations
    try {
      this.savedIncidentConfigurations = await this.getAllFieldConfigurations();
      console.log('AppComponent: onSaveAsAccepted(): savedIncidentConfigurations:', this.savedIncidentConfigurations);
      this.fieldsConfigOptions = this.buildFieldsConfigOptions(this.savedIncidentConfigurations);
      this.loadedIncidentConfigId = this.savedIncidentConfigurations[this.loadedIncidentConfigName].id;
    }
    catch (error) {
      console.error('AppComponent: onSaveAsAccepted(): Caught error fetching fields configuration:', error);
    }
    this.showSaveAsDialog = false;
  }



  onSaveAsCanceled() {
    console.log('onSaveAsCanceled()');
    this.showSaveAsDialog = false;
    this.saveAsConfigName = '';
  }



  onDeleteClicked() {
    console.log('onDeleteClicked()');
    this.showDeleteDialog = true;
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      (document.getElementsByClassName('deleteConfigDialog')[0].getElementsByClassName('ui-inputtext')[1] as HTMLInputElement).focus();
    }, 200);
  }



  onDeleteCanceled() {
    console.log('onDeleteCanceled()');
    this.showDeleteDialog = false;
  }



  onDeleteDemistoApiServerHidden() {
    this.showDemistoApiServerOpenDialog = true;
  }



  onDeleteAccepted() {
    console.log('onDeleteAccepted()');
    this.showDeleteDialog = false;
    this.confirmDialogHeader = 'Confirm Deletion';
    let message = `Are you sure that you would like to delete the configurations: ${this.selectedDeleteConfigs.join(', ')} ?`;
    if (this.selectedDeleteConfigs.includes(this.loadedIncidentConfigName) ) {
      message = `Are you sure you want to delete the active configuration '${this.loadedIncidentConfigName}' ?`;
    }
    this.confirmationService.confirm( {
      message,
      accept: () => this.onDeleteConfirmed(),
      icon: 'pi pi-exclamation-triangle'
    });
  }



  async onDeleteConfirmed() {
    console.log('onDeleteConfirmed()');

    this.selectedDeleteConfigs.forEach( async configName => {
      try {
        await this.fetcherService.deleteFieldConfiguration(configName);
      }
      catch (error) {
        console.error(`onDeleteConfirmed(): caught error whilst deleting configuration ${configName}`);
        return;
      }
    });

    // fetch fields config
    try {
      this.savedIncidentConfigurations = await this.getAllFieldConfigurations();
      console.log('AppComponent: onDeleteConfirmed(): savedIncidentConfigurations:', this.savedIncidentConfigurations);
      this.fieldsConfigOptions = this.buildFieldsConfigOptions(this.savedIncidentConfigurations);
      this.messageWithAutoClear({severity: 'success', summary: 'Successful', detail: `Configuration ${this.selectedOpenConfig} was successfully deleted`});

      // handle when we've deleted the loaded config
      if (this.selectedDeleteConfigs.includes(this.loadedIncidentConfigName)) {
        this.loadedIncidentConfigName = undefined;
        this.loadedIncidentConfigId = undefined;
      }
    }
    catch (error) {
      console.error('AppComponent: onDeleteConfirmed(): Caught error fetching fields configuration:', error);
    }

    this.selectedDeleteConfigs = []; // reset selection
  }



  async onSaveClicked() {
    console.log('onSaveClicked()');
    let config: FieldConfig = {
      name: this.loadedIncidentConfigName,
      incident: this.parsedIncidentJson,
      incidentFieldsConfig: this.buildFieldConfig(this.incidentFields),
      customFieldsConfig: this.buildFieldConfig(this.customFields),
      createInvestigation: this.createInvestigation,
      id: this.loadedIncidentConfigId
    };
    // console.log('onSaveClicked(): config:', config);
    try {
      let res = await this.fetcherService.saveFieldConfiguration(config);
      this.messageWithAutoClear({severity: 'success', summary: 'Successful', detail: `Configuration '${this.selectedOpenConfig}' has been saved`});
    }
    catch (error) {
      console.error('onSaveClicked(): caught error saving field config:', error);
      return;
    }

    // Get Fields Configurations
    try {
      this.savedIncidentConfigurations = await this.getAllFieldConfigurations();
      // console.log('AppComponent: onSaveClicked(): savedIncidentConfigurations:', this.savedIncidentConfigurations);
      this.fieldsConfigOptions = this.buildFieldsConfigOptions(this.savedIncidentConfigurations);
    }
    catch (error) {
      console.error('AppComponent: onSaveClicked(): Caught error fetching fields configuration:', error);
    }
  }



  onOpenClicked() {
    console.log('onOpenClicked()');
    this.showOpenDialog = true;
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      (document.getElementsByClassName('openDialog')[0].getElementsByClassName('ui-inputtext')[1] as HTMLInputElement).focus();
    }, 200);
  }



  onConfigOpened() {
    console.log('onConfigOpened()');
    this.showOpenDialog = false;
    const selectedConfig = this.savedIncidentConfigurations[this.selectedOpenConfig];

    this.parsedIncidentJson = selectedConfig.incident;
    console.log('onConfigOpened(): parsedIncidentJson:', this.parsedIncidentJson);
    this.buildIncidentFields(selectedConfig.incident);
    this.mergeLoadedFieldConfig(selectedConfig);
    this.loadedIncidentConfigName = selectedConfig.name;
    this.loadedIncidentConfigId = selectedConfig.id;
    this.createInvestigation = selectedConfig.createInvestigation;
    this.selectedOpenConfig = ''; // reset selection
  }



  onOpenCanceled() {
    console.log('onOpenCancelled()');
    this.showOpenDialog = false;
  }



  onBulkCreateClicked() {
    console.log('onBulkCreateClicked()');
    this.showBulkCreateDialog = true;
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      (document.getElementsByClassName('bulkCreateDialog')[0].getElementsByClassName('ui-inputtext')[1] as HTMLInputElement).focus();
    }, 200);
  }



  onBulkCreateCanceled() {
    console.log('onBulkCreateCanceled()');
    this.showBulkCreateDialog = false;
  }



  async onCreateBulkIncidents() {
    console.log('onCreateBulkIncidents()');
    this.showBulkCreateDialog = false;
    this.showBulkResultsDialog = true;
    this.changeDetector.detectChanges(); // trigger change detection

    this.bulkCreateResults = [];

    console.log('selectedBulkCreateConfigs:', this.selectedBulkCreateConfigs);

    /*
    Steps to complete:

    1.  Load config
    2.  Test server
    3.  Load server fields
    4.  Check for keys that can't be pushed
    5.  Display them in a column
    6.  Push case with all other fields
    7.  Display results in a column
    */

    let createIncidentPromises: Promise<any>[] = [];
    let testResults = [];
    let serverFieldDefinitions = {};

    let serverTestPromises: Promise<any>[] = this.selectedBulkCreateApiServers.map( async serverId => {
      console.log(`onCreateBulkIncidents(): Testing Demisto server ${serverId}`);
      const testResult  = await this.fetcherService.testApiServer(serverId);

      testResults.push({serverId, testResult});

      if (testResult.success) {
        console.log(`Fetching field definitions from Demisto server ${serverId}`);
        const fetchedIncidentFieldDefinitions: FetchedIncidentField[] = await this.fetcherService.getIncidentFieldDefinitions(serverId);

        serverFieldDefinitions[serverId] = this.parseFetchedIncidentFieldDefinitions(fetchedIncidentFieldDefinitions);
      }
    } );

    await Promise.all(serverTestPromises);
    console.log('Server tests and field fetching complete');
    console.log('serverFieldDefinitions:', serverFieldDefinitions);

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

        console.log('onCreateBulkIncidents(): configName:', configName);
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

        console.log('onCreateBulkIncidents(): newIncident:', newIncident);

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
    console.log('Incident creation complete');

    console.log('onCreateBulkIncidents(): bulkCreateResults:', this.bulkCreateResults);

    this.selectedBulkCreateConfigs = []; // reset selection
    this.selectedBulkCreateApiServers = [];
  }



  async onClickDemistoInvestigateUrl(incidentId: number, serverId: string) {
    console.log('onClickDemistoInvestigateUrl(): id:', incidentId);
    await this.fetcherService.createInvestigation(incidentId, serverId);
    const url = `${serverId}/#/incident/${incidentId}`;
    window.open(url, '_blank');
  }



  async testDemistoApiServer(serverId: string): Promise<boolean> {
    const testRes = await this.fetcherService.testApiServer(serverId);
    return testRes.success;
  }



  async switchCurrentDemistoApiServer(serverId: string): Promise<void> {
    /*
    Called from onDemistoApiServerSelected()
    Tests selected server
    Sets currentDemistoApiName and currentServerApiInit
    */
    console.log('switchCurrentDemistoApiServer(): serverId:', serverId);

    const currentDemistoApiNameReselected = this.currentDemistoApiName === serverId;
    const noServerPreviouslySelected = !this.currentDemistoApiName;

    if (currentDemistoApiNameReselected) {
      console.log('switchCurrentDemistoApiServer(): currentDemistoApiName was reselected.  Returning');
      return;
    }

    // this is the procedure to load a demistoApiServer
    // test it and then 'load' it
    let testRes;
    try {
      testRes = await this.fetcherService.testApiServer(serverId);
      this.currentDemistoApiName = serverId;
      this.currentServerApiInit = testRes.success;
    }
    catch (error) {
      this.currentServerApiInit = false;
      if (testRes) {
        console.error('Error loading API server:', testRes);
      }
      else {
        console.error('Error loading API server:', error);
      }
    }

    if (this.currentServerApiInit) {
      // Refresh Demisto Incident Fields
      try {
        await this.fetchIncidentFieldDefinitions(this.currentDemistoApiName);

        if (this.loadedIncidentConfigName && !noServerPreviouslySelected) {
          const message = `Do you want to attempt to keep your current field values and selections, or reset them to their saved state?`;
          this.confirmationService.confirm( {
            message,
            accept: () => this.mergeAndKeepLoadedFieldConfig(),
            reject: () => this.mergeLoadedFieldConfig(this.savedIncidentConfigurations[this.loadedIncidentConfigName]),
            acceptLabel: 'Keep Current Values & Selections',
            rejectLabel: 'Reset to Saved State',
            icon: ''
          });
        }
        else if (this.loadedIncidentConfigName && noServerPreviouslySelected) {
          const selectedConfig = this.savedIncidentConfigurations[this.loadedIncidentConfigName];
          this.buildIncidentFields(selectedConfig.incident);
          this.mergeLoadedFieldConfig(selectedConfig);
        }
      }
      catch (error) {
        console.error('AppComponent: switchCurrentDemistoApiServer(): Caught error fetching Demisto incident fields:', error);
      }
    }

  }



  async onDemistoApiServerSelected() {
    console.log('onDemistoApiServerSelected(): selectedDemistoApiName:', this.selectedDemistoApiName);
    await this.switchCurrentDemistoApiServer(this.selectedDemistoApiName);
    this.showDemistoApiServerOpenDialog = false;
  }



  async onOpenDemistoServersClicked() {
    console.log('onOpenDemistoServersClicked()');
    this.showDemistoApiServerOpenDialog = true;
  }



  async onNewDemistoApiServer() {
    console.log('onNewDemistoApiServer()');
    this.newDemistoServerDialogMode = 'new';
    this.showDemistoApiServerOpenDialog = false;
    this.showNewDemistoApiServerDialog = true;
    this.newDemistoServerUrl = '';
    this.newDemistoServerApiKey = '';
    this.newDemistoServerTrustAny = true;
    setTimeout( () =>
      document.getElementsByClassName('newDemistoApiServerDialog')[0].getElementsByTagName('input')[0].focus()
      , 100);
  }



  async onNewDemistoApiServerSaved() {
    console.log('onNewDemistoApiServerSaved()');
    this.showNewDemistoApiServerDialog = false;
    this.showDemistoApiServerOpenDialog = true;

    const success = await this.fetcherService.createDemistoApi(this.newDemistoServerUrl, this.newDemistoServerApiKey, this.newDemistoServerTrustAny);
    console.log('onNewDemistoApiServerSaved(): success:', success);

    // refresh servers
    await this.refreshDemistoApi(true);

    this.newDemistoServerUrl = '';
    this.newDemistoServerApiKey = '';
    this.newDemistoServerTrustAny = true;
  }



  onNewDemistoApiServerCanceled() {
    this.showNewDemistoApiServerDialog = false;
    this.showDemistoApiServerOpenDialog = true;
  }



  async onDeleteDemistoApiServer() {
    console.log(`onDeleteDemistoApiServer(): ${this.demistoApiServerToDelete}`);
    this.showDemistoApiServerOpenDialog = false;
    this.showDeleteDemistoApiServerDialog = true;
    this.demistoApiServerToDelete = this.selectedDemistoApiName;
  }



  async onDeleteDemistoApiServerConfirmed() {
    console.log('onDeleteDemistoApiServerConfirmed()');
    this.showDemistoApiServerOpenDialog = true;
    this.showDeleteDemistoApiServerDialog = false;
    let res;
    try {
      res = await this.fetcherService.deleteDemistoApi(this.demistoApiServerToDelete);
      await this.refreshDemistoApi();

      console.log('demistoApiEndpoints:', this.demistoApiEndpoints);

      // handle deletion of current API
      if (this.demistoApiServerToDelete === this.currentDemistoApiName) {
        this.currentDemistoApiName = undefined;
        this.currentServerApiInit = false;
        // default api logic will be handled by the server and refreshDemistoApi()
      }
    }
    catch (error) {
      //  do something if there's an error
      console.error(`Caught error deleting ${this.demistoApiServerToDelete}`, res.error);
    }

    if (!this.currentServerApiInit) {
      // Clear Demisto Incident Field Definitions
      this.fetchedIncidentFieldDefinitions = undefined;
      this.mergeAndKeepLoadedFieldConfig();
    }

  }



  async onSetDefaultDemistoApiServer() {
    console.log('onSetDefaultDemistoApiServer()');
    await this.fetcherService.setDemistoDefaultApi(this.selectedDemistoApiName);
    await this.refreshDemistoApi();
  }



  async onRefreshDemistoApiServers() {
    console.log('onRefreshDemistoApiServers()');
    await this.refreshDemistoApi();
  }



  async onTestDemistoApiServer() {
    console.log('onTestDemistoApiServer()');
    const success = await this.testDemistoApiServer(this.selectedDemistoApiName);
    if (success) {
      this.messagesReplace( [{ severity: 'success', summary: 'Success', detail: `Demisto API test success for ${this.defaultDemistoApiName}`}] );
    }
    else {
      this.messagesReplace( [{ severity: 'error', summary: 'Failure', detail: `Demisto API test failure for ${this.defaultDemistoApiName}`}] );
    }
  }



  async onEditDemistoApiServer() {
    console.log('onEditDemistoApiServer()');
    this.newDemistoServerDialogMode = 'edit';
    this.showNewDemistoApiServerDialog = true;
    this.showDemistoApiServerOpenDialog = false;

    // get Demisto server details and stick them in
    // newDemistoServerUrl, newDemistoServerApiKey, newDemistoServerTrustAny
    const demistoServer = this.demistoApiEndpoints[this.selectedDemistoApiName];
    this.newDemistoServerUrl = demistoServer.url;
    this.newDemistoServerApiKey = '';
    this.newDemistoServerTrustAny = demistoServer.trustAny;
  }



  async onDemistoApiServerUpdated(updatedServerUrl: string) {
    console.log('onDemistoApiServerUpdated()');

    this.showNewDemistoApiServerDialog = false;
    this.showDemistoApiServerOpenDialog = true;

    const oldSelectedDemistoApiName = this.selectedDemistoApiName;

    const currentDemistoApiServerUpdated = oldSelectedDemistoApiName === this.currentDemistoApiName;

    let res: any;
    if (this.newDemistoServerApiKey === '') {
      res = await this.fetcherService.updateDemistoApi(this.selectedDemistoApiName, this.newDemistoServerUrl, this.newDemistoServerTrustAny );
    }
    else {
      res = await this.fetcherService.updateDemistoApi(this.selectedDemistoApiName, this.newDemistoServerUrl, this.newDemistoServerTrustAny, this.newDemistoServerApiKey);
    }

    if (oldSelectedDemistoApiName === this.currentDemistoApiName) {
      // it's necessary to fix currentDemistoApiName if it has been edited
      // before running refreshDemistoApi()
      this.currentDemistoApiName = this.newDemistoServerUrl;
    }

    // refresh servers
    await this.refreshDemistoApi();

    if (currentDemistoApiServerUpdated && this.currentServerApiInit) {
      // Refresh Demisto Incident Fields, if current server is initialised
      try {
        await this.fetchIncidentFieldDefinitions(this.currentDemistoApiName);

        if (this.loadedIncidentConfigName) {
          const message = `Do you want to attempt to keep your current field values and selections, or reset them to their saved state?`;
          this.confirmationService.confirm( {
            message,
            accept: () => this.mergeAndKeepLoadedFieldConfig(),
            reject: () => this.mergeLoadedFieldConfig(this.savedIncidentConfigurations[this.loadedIncidentConfigName]),
            acceptLabel: 'Keep Current Values & Selections',
            rejectLabel: 'Reset to Saved State',
            icon: ''
          });
        }
      }
      catch (error) {
        console.error('AppComponent: onDemistoApiServerUpdated(): Caught error fetching Demisto incident fields:', error);
      }
    }

    this.newDemistoServerUrl = '';
    this.newDemistoServerApiKey = '';
    this.newDemistoServerTrustAny = true;
  }



  onNewEditDemistoApiServerHidden() {
    this.showDemistoApiServerOpenDialog = true;
  }



  onLoadFromDemistoClicked() {
    this.showLoadFromDemistoDialog = true;
    if (this.currentDemistoApiName !== '') {
      this.demistoApiToLoadFrom = this.currentDemistoApiName;
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



  async onLoadFromDemistoAccepted() {
    console.log('onLoadFromDemistoAccepted()');
    this.showLoadFromDemistoDialog = false;

    try {
      const res = await this.fetcherService.demistoIncidentImport(this.demistoIncidentToLoad, this.demistoApiToLoadFrom);
      console.log('onLoadFromDemistoAccepted(): res:', res);

      if (res.success) {
        this.parsedIncidentJson = res.incident;
        this.buildIncidentFields(this.parsedIncidentJson);
        this.messageWithAutoClear( { severity: 'success', summary: 'Success', detail: `Incident ${this.demistoIncidentToLoad} was successfully loaded from ${this.demistoApiToLoadFrom}`} );
        this.loadedIncidentConfigName = undefined;
        this.loadedIncidentConfigId = undefined;
        this.createInvestigation = true;
      }

      else if (res.error === `Query returned 0 results`) {
        this.messagesReplace( [{ severity: 'error', summary: 'Failure', detail: `Incident ${this.demistoIncidentToLoad} was not found on Demisto server ${this.demistoApiToLoadFrom}`}] );
      }

      else {
        this.messagesReplace( [{ severity: 'error', summary: 'Error', detail: `Error returned fetching incident ${this.demistoIncidentToLoad}: ${res.error}`}] );
      }
      this.demistoApiToLoadFrom = '';
      this.demistoIncidentToLoad = '';
    }

    catch (error) {
      if ('message' in error) {
        error = error.message;
      }
      this.messagesReplace( [{ severity: 'error', summary: 'Error', detail: `Error thrown pulling incident ${this.demistoIncidentToLoad}: ${error}`}] );
      return;
    }
  }



  onNewJsonMappingClicked() {
    this.showJsonMappingUI = true;

  }



}
