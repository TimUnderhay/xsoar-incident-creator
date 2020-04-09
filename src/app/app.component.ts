import { Component, OnInit, ViewChildren, ChangeDetectorRef } from '@angular/core';
import { FetcherService } from './fetcher-service';
import { DemistoAPI, DemistoAPIEndpoints } from './types/demisto-properties';
import { User } from './types/user';
import { ApiStatus } from './types/api-status';
import { SelectItem } from 'primeng/api';
import { IncidentField, IncidentFields } from './types/incident-fields';

import { DemistoIncidentField, DemistoIncidentFieldDefinitions } from './types/demisto-incident-field';
import { FieldConfig, FieldsConfig, IncidentFieldsConfig } from './types/fields-config';
import { ConfirmationService } from 'primeng/api';
import { PMessageOption } from './types/message-options';
import { BulkCreateResult } from './types/bulk-create-result';

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



  private investigationFields = ['id', 'account', 'created', 'modified', 'ShardID', 'account', 'activated', 'autime', 'canvases', 'closeNotes', 'closeReason', 'closed', 'closingUserId', 'created', 'droppedCount', 'dueDate', 'hasRole', 'id', 'investigationId', 'isPlayground', 'lastOpen', 'linkedCount', 'linkedIncidents', 'modified', 'notifyTime', 'openDuration', 'parent', 'playbookId', 'previousRoles', 'rawCategory', 'rawCloseReason', 'rawJSON', 'rawName', 'rawPhase', 'rawType', 'reason', 'runStatus', 'sla', 'sortValues', 'sourceBrand', 'sourceInstance', 'status', 'version' ]; // it may become necessary to permit some of these fields in the future

  // API
  demistoApiConfigs: DemistoAPIEndpoints = {};
  demistoApiConfigsOptions: SelectItem[];
  get demistoApiConfigsLen() { return Object.keys(this.demistoApiConfigs).length; }
  defaultDemistoApiName: string;
  currentDemistoApiName: string;
  currentServerApiInit = false;


  loggedInUser: User;
  resultMessage: string;

  // for p-messages
  messages: PMessageOption[] = [];
  messagesClearTimeout: ReturnType<typeof setTimeout> = null;

  fileData: any; // parsed incident json.

  demistoIncidentFieldDefinitions: DemistoIncidentFieldDefinitions; // the fields taken from Demisto
  incidentFields: IncidentFields; // the fields of our imported or loaded JSON
  customFields: IncidentFields; // the custom fields of our imported or loaded json
  createInvestigation = true;


  loadedConfigName: string; // must clear when loaded from json or when current config is deleted
  loadedConfigId: string; // must clear when loaded from json or when current config is deleted

  fieldsConfigurations: FieldsConfig = {};
  get fieldsConfigurationsLen(): number {
    // returns the number of saved field configs
    return Object.keys(this.fieldsConfigurations).length;
  }

  fieldsConfigOptions: SelectItem[] = []; // dropdown/listbox options object for all field configs

  // save as dialog
  showSaveAsDialog = false;
  canSubmitSaveAs = false;
  saveAsConfigName = ''; // for text label

  // delete dialog
  showDeleteDialog = false;
  selectedDeleteConfigs: string[] = [];
  confirmDialogHeader = '';

  // open dialog
  showOpenDialog = false;
  selectedOpenConfig = '';

  // bulk create dialog
  showBulkCreateDialog = false;
  selectedBulkCreateConfigs: string[] = [];
  selectedBulkCreateApiServers: string[] = [];

  // bulk results
  showBulkResultsDialog = false;
  bulkCreateResults: BulkCreateResult[] = [];

  // select demisto api server dialog
  showDemistoApiServerOpenDialog = false;
  selectedDemistoApiName: string;

  // new / edit Demisto api server dialog
  showNewDemistoApiServerDialog = false;
  newDemistoServerUrl = '';
  newDemistoServerApiKey = '';
  newDemistoServerTrustAny = true;
  get newDemistoServerSaveDisabled() {
    if (this.newDemistoServerDialogMode === 'new') {
      return this.newDemistoServerUrl in this.demistoApiConfigs;
    }
    // edit mode
    return this.selectedDemistoApiName !== this.newDemistoServerUrl && this.newDemistoServerUrl in this.demistoApiConfigs;
  }
  newDemistoServerDialogMode: DemistoServerEditMode = 'new';
  get newEditTestButtonDisabled(): boolean {
    if (this.newDemistoServerDialogMode === 'new') {
      return !this.newDemistoServerUrl || !this.newDemistoServerApiKey;
    }
    // edit mode
    return !this.newDemistoServerUrl;
  }

  // delete Demisto api server dialog
  showDeleteDemistoApiServerDialog = false;
  demistoApiServerToDelete: string;


  get saveAsDisabled(): boolean {
    return this.saveAsConfigName in this.fieldsConfigurations;
  }

  // Import from Demisto
  showLoadFromDemistoDialog = false;
  demistoIncidentToLoad = '';
  demistoApiToLoadFrom = '';
  get importFromDemistoAcceptDisabled(): boolean {
    return this.demistoApiToLoadFrom === '' || this.demistoIncidentToLoad.match(/^\d+$/) === null;
  }



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
        await this.getDemistoIncidentFieldDefinitions(this.currentDemistoApiName);
      }
      catch (error) {
        console.error('AppComponent: ngOnInit(): Caught error fetching Demisto incident fields:', error);
      }
    }

    if (this.demistoApiConfigsLen === 0) {
      setTimeout(() => this.onNewDemistoApiServer(), 0);
    }

    // Fields Configurations
    try {
      this.fieldsConfigurations = await this.getAllFieldConfigurations();
      console.log('AppComponent: ngOnInit(): fieldsConfigurations:', this.fieldsConfigurations);
      this.fieldsConfigOptions = this.buildFieldsConfigOptions(this.fieldsConfigurations);
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

      this.demistoApiConfigs = await this.fetcherService.getDemistoApi(); // obtain saved Demisto API endpoints
      console.log('demistoApiInit(): demistoApiConfigs:', this.demistoApiConfigs);

      const defaultApiResult = await this.fetcherService.getDemistoDefaultApi();
      console.log('demistoApiInit(): defaultApiResult:', defaultApiResult);

      const configsAreEmpty = this.demistoApiConfigsLen === 0;
      const defaultDemistoApiDefinedButMissing = !configsAreEmpty && defaultApiResult.defined && !(defaultApiResult.serverId in this.demistoApiConfigs);
      const defaultDemistoApiIsDefined = !configsAreEmpty && defaultApiResult.defined && defaultApiResult.serverId in this.demistoApiConfigs;

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
          this.messageWithAutoClear( { severity: 'success', summary: 'Success', detail: `Demisto API communication to ${this.currentDemistoApiName} is initialised`});
        }
        else {
          this.messageWithAutoClear( { severity: 'error', summary: 'Failure', detail: `Demisto API communication is not initialised to ${this.currentDemistoApiName}`} );
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
    this.demistoApiConfigsOptions = Object.keys(this.demistoApiConfigs).map( key => ({ value: key, label: this.defaultDemistoApiName && key === this.defaultDemistoApiName ? `${key} (default)` : key}
    ) );
    console.log('buildDemistoApiConfigOptions(): demistoApiConfigsOptions:', this.demistoApiConfigsOptions);
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
    const lastDemistoApiConfigsLen = this.demistoApiConfigsLen;
    const lastCurrentDemistoApiName = this.currentDemistoApiName;

    this.demistoApiConfigs = await this.fetcherService.getDemistoApi(); // obtain saved Demisto API endpoints

    // console.log('refreshDemistoApi(): demistoApiConfigs:', this.demistoApiConfigs);

    const firstDefinedServer = setDefault && lastDemistoApiConfigsLen === 0 && this.demistoApiConfigsLen !== 0;

    if (firstDefinedServer) {
      // if no api servers were previously defined, make the first API to be added, the default
      const firstServerId = Object.keys(this.demistoApiConfigs)[0];
      await this.fetcherService.setDemistoDefaultApi(firstServerId);
      this.switchCurrentDemistoApiServer(firstServerId);
    }

    // Gets the default API server, as it may have changed.
    const defaultApiResult = await this.fetcherService.getDemistoDefaultApi();

    const configsAreEmpty = this.demistoApiConfigsLen === 0;

    const defaultDemistoApiIsDefined = !configsAreEmpty && defaultApiResult.defined && defaultApiResult.serverId in this.demistoApiConfigs;

    if (configsAreEmpty) {
      this.currentServerApiInit = false;
      this.currentDemistoApiName = undefined;
    }
    else if (defaultDemistoApiIsDefined) {
      this.defaultDemistoApiName = defaultApiResult.serverId;
    }

    const currentApiStillDefined = this.currentDemistoApiName && this.currentDemistoApiName in this.demistoApiConfigs; // make sure the currently selected API hasn't been deleted

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
        await this.getDemistoIncidentFieldDefinitions(this.currentDemistoApiName);
      }
      catch (error) {
        console.error('AppComponent: refreshDemistoApi(): Caught error fetching Demisto incident fields:', error);
      }
    }
    */
  }



  parseDemistoIncidentFieldDefinitions(demistoIncidentFieldDefinitions: DemistoIncidentField[]): DemistoIncidentFieldDefinitions {
    let tmpFields: DemistoIncidentFieldDefinitions = {};
    demistoIncidentFieldDefinitions.forEach( (field: DemistoIncidentField) => {
      const shortName = field.cliName;
      tmpFields[shortName] = field;
    });
    return tmpFields;
  }



  async getDemistoIncidentFieldDefinitions(serverId): Promise<boolean> {
    /*
    Called from ngOnInit(), onReloadFieldDefinitions(), refreshDemistoApi(), switchCurrentDemistoApiServer()
    Fetches incident field definitions from Demisto
    Saves them to demistoIncidentFieldDefinitions
    */
    console.log('getDemistoIncidentFieldDefinitions()');
    try {
      const demistoIncidentFieldDefinitions: DemistoIncidentField[] = await this.fetcherService.getIncidentFieldDefinitions(serverId);

      this.demistoIncidentFieldDefinitions = this.parseDemistoIncidentFieldDefinitions(demistoIncidentFieldDefinitions);

      console.log('demistoIncidentFieldDefinitions:', this.demistoIncidentFieldDefinitions);
      return true;

      // for identification purposes, output all the field types
      /*let fieldTypes = demistoIncidentFieldDefinitions.reduce( (result: string[], field: DemistoIncidentField) => {
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
        this.messageWithAutoClear({ severity: 'success', summary: 'Success', detail: 'Demisto API communication test success'});
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
          detail: `Demisto API communication is not initialised. ${testResult}`
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
        detail: `Demisto API communication is not initialised. ${testResult}`
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
      if (this.demistoIncidentFieldDefinitions && shortName in this.demistoIncidentFieldDefinitions) {
        tmpField.longName = this.demistoIncidentFieldDefinitions[shortName].name;
        tmpField.locked = false;
        tmpField.fieldType = this.demistoIncidentFieldDefinitions[shortName].type;
        if (['attachments'].includes(tmpField.fieldType) ) {
          tmpField.locked = true;
          tmpField.lockedReason = 'This field type is not supported for import';
        }
      }
      else if (!this.demistoIncidentFieldDefinitions) {
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
    console.log('customFields:', this.customFields);
  }



  buildIncidentFields(incident) { // incident = parsed json
    /*
    Called from onIncidentJsonUploaded(), getSampleIncident(), onConfigOpened()
    */
    let incidentFields: IncidentFields = {};
    Object.keys(incident).forEach( shortName => {
      // console.log('shortName:', shortName);
      let value = incident[shortName];

      if (this.investigationFields.includes(shortName)) {
        console.log(`Skipping field '${shortName}' as it is an investigation field`);
        return;
      }

      if (shortName === 'CustomFields') {
        this.buildCustomFields(incident.CustomFields);
        return;
      }

      if (this.demistoIncidentFieldDefinitions && !(shortName in this.demistoIncidentFieldDefinitions)) {
        console.error('Field not found:', shortName);
        return;
      }

      if (!this.demistoIncidentFieldDefinitions) {
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
        longName: this.demistoIncidentFieldDefinitions[shortName].name,
        enabled: false,
        locked: false,
        value,
        originalValue: value,
        fieldType: this.demistoIncidentFieldDefinitions[shortName].type,
        custom: false
      };

    });
    this.incidentFields = incidentFields;
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

        const noFieldDefinitions = !this.demistoIncidentFieldDefinitions;
        const typeNotSupported = ['attachments'].includes(field.fieldType);
        const fieldFoundInFieldDefinitions = !noFieldDefinitions && shortName in this.demistoIncidentFieldDefinitions;

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
          field.fieldType = this.demistoIncidentFieldDefinitions[shortName].type;
        }

        field.enabled = !field.locked ? field.enabled : false;
      });
    });
    this.incidentFields = JSON.parse(JSON.stringify(this.incidentFields)); // hack deep copy to trigger change detection
    this.customFields = JSON.parse(JSON.stringify(this.customFields)); // hack deep copy to trigger change detection
  }



  mergeLoadedFieldConfig(config: FieldConfig) {
    /*
    Called from onConfigOpened(), switchCurrentDemistoApiServer(), onDemistoApiServerUpdated()
    Does not need to be called from onIncidentJsonUploaded() because uploaded JSON...
    doesn't contain info on which fields to enable
    */

    Object.values(config.incidentFieldsConfig).forEach( field => {
      const shortName = field.shortName;
      if (!this.incidentFields[shortName].locked) {
        this.incidentFields[shortName].enabled = field.enabled;
      }
      this.incidentFields[shortName].value = field.value;
      this.incidentFields[shortName].originalValue = field.value;
    } );

    Object.values(config.customFieldsConfig).forEach( field => {
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
        this.fileData = JSON.parse(reader.result as string);
        console.log('onIncidentJsonUploaded(): fileData:', this.fileData);
        this.buildIncidentFields(this.fileData);
        this.loadedConfigName = undefined;
        this.loadedConfigId = undefined;
        this.createInvestigation = true;

        uploadRef.clear(); // allow future uploads
      };

      reader.readAsText(data.files[0]); // kick off the read operation (calls onloadend())
    }
    catch (error) {
      console.error('onIncidentJsonUploaded(): Error parsing uploaded file:', error);
    }
  }



  onFreeformJsonUploaded(data: { files: File }, uploadRef) {
    let file = data.files[0];
    console.log('onFreeformJsonUploaded(): file:', file);

    try {
      let reader = new FileReader();
      reader.onloadend = (error: any) => {
        this.fileData = JSON.parse(reader.result as string);
        console.log('onFreeformJsonUploaded(): fileData:', this.fileData);
        this.buildIncidentFields(this.fileData);
        this.loadedConfigName = undefined;
        this.loadedConfigId = undefined;
        this.createInvestigation = true;

        uploadRef.clear(); // allow future uploads
      };

      reader.readAsText(data.files[0]); // kick off the read operation (calls onloadend())
    }
    catch (error) {
      console.error('onFreeformJsonUploaded(): Error parsing uploaded file:', error);
    }
  }



  async getSampleIncident() {
    let res = await this.fetcherService.getSampleIncident();
    this.fileData = res;
    console.log('getSampleIncident(): fileData:', this.fileData);
    this.buildIncidentFields(this.fileData);
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
      incident: this.fileData,
      incidentFieldsConfig: this.buildFieldConfig(this.incidentFields),
      customFieldsConfig: this.buildFieldConfig(this.customFields),
      createInvestigation: this.createInvestigation
    };
    try {
      let res = await this.fetcherService.saveNewFieldConfiguration(config);
      this.messageWithAutoClear({severity: 'success', summary: 'Successful', detail: `Configuration '${this.saveAsConfigName}' has been saved`});
      this.loadedConfigName = this.saveAsConfigName;
      this.saveAsConfigName = '';
    }
    catch (error) {
      console.error('onSaveAsAccepted(): caught error saving field config:', error);
      return;
    }

    // Fields Configurations
    try {
      this.fieldsConfigurations = await this.getAllFieldConfigurations();
      console.log('AppComponent: onSaveAsAccepted(): fieldsConfigurations:', this.fieldsConfigurations);
      this.fieldsConfigOptions = this.buildFieldsConfigOptions(this.fieldsConfigurations);
      this.loadedConfigId = this.fieldsConfigurations[this.loadedConfigName].id;
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
    if (this.selectedDeleteConfigs.includes(this.loadedConfigName) ) {
      message = `Are you sure you want to delete the active configuration '${this.loadedConfigName}' ?`;
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
      this.fieldsConfigurations = await this.getAllFieldConfigurations();
      console.log('AppComponent: onDeleteConfirmed(): fieldsConfigurations:', this.fieldsConfigurations);
      this.fieldsConfigOptions = this.buildFieldsConfigOptions(this.fieldsConfigurations);
      this.messageWithAutoClear({severity: 'success', summary: 'Successful', detail: `Configuration ${this.selectedOpenConfig} was successfully deleted`});

      // handle when we've deleted the loaded config
      if (this.selectedDeleteConfigs.includes(this.loadedConfigName)) {
        this.loadedConfigName = undefined;
        this.loadedConfigId = undefined;
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
      name: this.loadedConfigName,
      incident: this.fileData,
      incidentFieldsConfig: this.buildFieldConfig(this.incidentFields),
      customFieldsConfig: this.buildFieldConfig(this.customFields),
      createInvestigation: this.createInvestigation,
      id: this.loadedConfigId
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
      this.fieldsConfigurations = await this.getAllFieldConfigurations();
      // console.log('AppComponent: onSaveClicked(): fieldsConfigurations:', this.fieldsConfigurations);
      this.fieldsConfigOptions = this.buildFieldsConfigOptions(this.fieldsConfigurations);
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
    const selectedConfig = this.fieldsConfigurations[this.selectedOpenConfig];

    this.fileData = selectedConfig.incident;
    console.log('onConfigOpened(): fileData:', this.fileData);
    this.buildIncidentFields(selectedConfig.incident);
    this.mergeLoadedFieldConfig(selectedConfig);
    this.loadedConfigName = selectedConfig.name;
    this.loadedConfigId = selectedConfig.id;
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
        const demistoIncidentFieldDefinitions: DemistoIncidentField[] = await this.fetcherService.getIncidentFieldDefinitions(serverId);

        serverFieldDefinitions[serverId] = this.parseDemistoIncidentFieldDefinitions(demistoIncidentFieldDefinitions);
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
        let selectedConfig = this.fieldsConfigurations[configName];
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
        await this.getDemistoIncidentFieldDefinitions(this.currentDemistoApiName);

        if (this.loadedConfigName && !noServerPreviouslySelected) {
          const message = `Do you want to attempt to keep your current field values and selections, or reset them to their saved state?`;
          this.confirmationService.confirm( {
            message,
            accept: () => this.mergeAndKeepLoadedFieldConfig(),
            reject: () => this.mergeLoadedFieldConfig(this.fieldsConfigurations[this.loadedConfigName]),
            acceptLabel: 'Keep Current Values & Selections',
            rejectLabel: 'Reset to Saved State',
            icon: ''
          });
        }
        else if (this.loadedConfigName && noServerPreviouslySelected) {
          const selectedConfig = this.fieldsConfigurations[this.loadedConfigName];
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

    const lastDemistoApiConfigsLen = this.demistoApiConfigsLen;

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

      console.log('demistoApiConfigs:', this.demistoApiConfigs);

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
      this.demistoIncidentFieldDefinitions = undefined;
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
    const demistoServer = this.demistoApiConfigs[this.selectedDemistoApiName];
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
        await this.getDemistoIncidentFieldDefinitions(this.currentDemistoApiName);

        if (this.loadedConfigName) {
          const message = `Do you want to attempt to keep your current field values and selections, or reset them to their saved state?`;
          this.confirmationService.confirm( {
            message,
            accept: () => this.mergeAndKeepLoadedFieldConfig(),
            reject: () => this.mergeLoadedFieldConfig(this.fieldsConfigurations[this.loadedConfigName]),
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
        this.fileData = res.incident;
        this.buildIncidentFields(this.fileData);
        this.messageWithAutoClear( { severity: 'success', summary: 'Success', detail: `Incident ${this.demistoIncidentToLoad} was successfully loaded from ${this.demistoApiToLoadFrom}`} );
        this.loadedConfigName = undefined;
        this.loadedConfigId = undefined;
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



}
