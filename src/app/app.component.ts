import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { NgForm } from '@angular/forms';
import { FetcherService } from './fetcher-service';
import { DemistoEndpoint, DemistoEndpoints } from './types/demisto-endpoints';
import { User } from './types/user';
import { DemistoEndpointStatus } from './types/demisto-endpoint-status';
import { SelectItem, ConfirmationService } from 'primeng/api';
import { IncidentField, IncidentFields } from './types/incident-fields';
import { FetchedIncidentType } from './types/fetched-incident-types';
import { FetchedIncidentField, FetchedIncidentFieldDefinitions } from './types/fetched-incident-field';
import { FieldConfig, FieldsConfig, IncidentFieldsConfig } from './types/fields-config';
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

  // Endpoint Properties
  demistoEndpoints: DemistoEndpoints = {};
  get demistoEndpointsLen() { return Object.keys(this.demistoEndpoints).length; }
  defaultDemistoEndpointName: string;
  currentDemistoEndpointName: string;
  currentDemistoEndpointInit = false;
  fetchedIncidentFieldDefinitions: FetchedIncidentFieldDefinitions; // the field definitions loaded from Demisto
  fetchedIncidentTypes: FetchedIncidentType[];

  // Incident Properties
  parsedIncidentJson: any; // parsed incident json.
  incidentFields: IncidentFields; // the fields of our imported or loaded JSON
  customFields: IncidentFields; // the custom fields of our imported or loaded JSON
  createInvestigation = true;

  // For PrimeNG
  messages: PMessageOption[] = [];
  messagesClearTimeout: ReturnType<typeof setTimeout> = null;
  demistoEndpointsItems: SelectItem[]; // holds list of endpoints for PrimeNG
  fieldsConfigItems: SelectItem[] = []; // dropdown/listbox options object for all field configs

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
  selectedBulkCreateEndpoints: string[] = [];

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


  get saveAsButtonDisabled(): boolean {
    return this.saveAsConfigName in this.savedIncidentConfigurations;
  }

  // Import from Demisto dialog
  showLoadFromDemistoDialog = false;
  demistoIncidentToLoad = '';
  demistoEndpointToLoadFrom = '';
  get importFromDemistoAcceptDisabled(): boolean {
    return this.demistoEndpointToLoadFrom === '' || this.demistoIncidentToLoad.match(/^\d+$/) === null;
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
      setTimeout(() => this.onNewDemistoEndpoint(), 0);
    }

    // Fields Configurations
    try {
      this.savedIncidentConfigurations = await this.fetcherService.getSavedIncidentConfigurations();
      console.log('AppComponent: ngOnInit(): savedIncidentConfigurations:', this.savedIncidentConfigurations);
      this.fieldsConfigItems = this.buildFieldsConfigItems(this.savedIncidentConfigurations);
    }
    catch (error) {
      console.error('AppComponent: ngOnInit(): Caught error fetching fields configuration:', error);
    }

    // Fetch Sample Incident -- Comment out before committing to master
    // await this.getSampleIncident();
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

    /*
    const currentDemistoServerChanged = this.currentDemistoEndpointInit && lastCurrentDemistoEndpointName !== this.currentDemistoEndpointName; // the current endpoint may have changed if it was edited

    if (currentDemistoServerChanged) {
      // Refresh Demisto Incident Fields
      try {
        await this.fetchIncidentFieldDefinitions(this.currentDemistoEndpointName);
      }
      catch (error) {
        console.error('AppComponent: refreshDemistoEndpoints(): Caught error fetching Demisto incident fields:', error);
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

      // for identification purposes, output all the field types
      /*let fieldTypes = fetchedIncidentFieldDefinitions.reduce( (result: string[], field: FetchedIncidentField) => {
        if (!result.includes(field.type)) {
          result.push(field.type);
        }
        return result;
      }, []);
      console.log('AppComponent: fetchIncidentFieldDefinitions(): fieldTypes:', fieldTypes);*/
    }
    catch (err) {
      console.log('AppComponent: fetchIncidentFieldDefinitions(): Caught error fetching Demisto incident fields:', err);
      return false;
    }
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
        // this.currentDemistoEndpointInit = true;
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
        // this.currentDemistoEndpointInit = false;
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
      // this.currentDemistoEndpointInit = false;
      return false;
    }
  }



  buildCustomFields(customFields) {
    /*
    Called from buildIncidentFields()
    */
    // console.log('AppComponent: buildCustomFields(): customFields:', customFields);
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
    console.log('AppComponent: buildCustomFields(): customFields:', this.customFields);
  }



  buildIncidentFields(incidentJson) {
    /*
    Called from onIncidentJsonUploaded(), getSampleIncident(), onConfigOpened()
    */
    console.log('AppComponent: buildIncidentFields(): incidentJson:', incidentJson);
    let incidentFields: IncidentFields = {};
    let skippedInvestigationFields = [];
    Object.keys(incidentJson).forEach( shortName => {
      // console.log('AppComponent: buildIncidentFields(): shortName:', shortName);
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
        console.warn(`Incident field not found: ${shortName}.  It's probably an investigation field and this can safely be ignored.`);
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
    console.log('AppComponent: buildIncidentFields(): incidentFields:', this.incidentFields);
  }



  mergeAndKeepLoadedFieldConfig() {
    console.log('AppComponent: mergeAndKeepLoadedFieldConfig()');
    // Attempts to keep current field selections and values
    const incidentFieldsDefined = this.incidentFields;
    const customFieldsDefined = this.customFields;

    if (!incidentFieldsDefined) {
      console.log('AppComponent: mergeAndKeepLoadedFieldConfig(): incidentFields not defined.  Returning');
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
    Takes a saved incident field configuration and compares it with the config from the current Demisto endpoint.
    Called from onConfigOpened(), switchCurrentDemistoEndpoint(), onDemistoEndpointUpdated()
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

    console.log('AppComponent: mergeLoadedFieldConfig(): incidentFields:', this.incidentFields);
    // this.incidentFields = JSON.parse(JSON.stringify(this.incidentFields)); // hack deep copy to trigger change detection
    // this.customFields = JSON.parse(JSON.stringify(this.customFields)); // hack deep copy to trigger change detection
  }



  onIncidentJsonUploaded(data: { files: File }, uploadRef) {
    let file = data.files[0];
    console.log('AppComponent: onIncidentJsonUploaded(): file:', file);

    let reader = new FileReader();

    reader.onloadend = (progressEvent: ProgressEvent) => {
      try {
        this.parsedIncidentJson = JSON.parse(reader.result as string);
        console.log('AppComponent: onIncidentJsonUploaded(): parsedIncidentJson:', this.parsedIncidentJson);
        this.buildIncidentFields(this.parsedIncidentJson);
        this.loadedIncidentConfigName = undefined;
        this.loadedIncidentConfigId = undefined;
        this.createInvestigation = true;
      }
      catch (error) {
        console.error('onIncidentJsonUploaded(): Error parsing uploaded JSON:', error);
      }
      uploadRef.clear(); // allow future uploads
    };


    reader.readAsText(data.files[0]); // kick off the read operation (calls onloadend())
  }



  async getSampleIncident() {
    let res = await this.fetcherService.getSampleIncident();
    this.parsedIncidentJson = res;
    console.log('AppComponent: getSampleIncident(): parsedIncidentJson:', this.parsedIncidentJson);
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
    console.log('AppComponent: onSaveAsClicked()');
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



  buildFieldsConfigItems(configs: FieldsConfig): SelectItem[] {
    let items: SelectItem[] = Object.values(configs).map( (config: FieldConfig) =>
      ({ label: config.name, value: config.name })
    );
    return items;
  }



  async onSaveAsAccepted() {
    console.log('AppComponent: onSaveAsAccepted()');

    const incident_config: FieldConfig = {
      name: this.saveAsConfigName,
      incident: this.parsedIncidentJson,
      incidentFieldsConfig: this.buildFieldConfig(this.incidentFields),
      customFieldsConfig: this.buildFieldConfig(this.customFields),
      createInvestigation: this.createInvestigation
    };
    try {
      let res = await this.fetcherService.saveNewIncidentConfiguration(incident_config);
      this.messageWithAutoClear({severity: 'success', summary: 'Successful', detail: `Configuration '${this.saveAsConfigName}' has been saved`});
      this.loadedIncidentConfigName = this.saveAsConfigName;
      this.saveAsConfigName = '';
    }
    catch (error) {
      console.error('AppComponent: onSaveAsAccepted(): caught error saving field config:', error);
      return;
    }

    // Update Fields Configurations
    try {
      this.savedIncidentConfigurations = await this.fetcherService.getSavedIncidentConfigurations();
      console.log('AppComponent: onSaveAsAccepted(): savedIncidentConfigurations:', this.savedIncidentConfigurations);
      this.fieldsConfigItems = this.buildFieldsConfigItems(this.savedIncidentConfigurations);
      this.loadedIncidentConfigId = this.savedIncidentConfigurations[this.loadedIncidentConfigName].id;
    }
    catch (error) {
      console.error('AppComponent: onSaveAsAccepted(): Caught error fetching fields configuration:', error);
    }
    this.showSaveAsDialog = false;
  }



  onSaveAsCanceled() {
    console.log('AppComponent: onSaveAsCanceled()');
    this.showSaveAsDialog = false;
    this.saveAsConfigName = '';
  }



  onDeleteClicked() {
    console.log('AppComponent: onDeleteClicked()');
    this.showDeleteDialog = true;
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      (document.getElementsByClassName('deleteConfigDialog')[0].getElementsByClassName('ui-inputtext')[1] as HTMLInputElement).focus();
    }, 200);
  }



  onDeleteCanceled() {
    console.log('AppComponent: onDeleteCanceled()');
    this.showDeleteDialog = false;
  }



  onDeleteDemistoEndpointHidden() {
    this.showDemistoEndpointOpenDialog = true;
  }



  onDeleteAccepted() {
    console.log('AppComponent: onDeleteAccepted()');
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
    console.log('AppComponent: onDeleteConfirmed()');

    this.selectedDeleteConfigs.forEach( async configName => {
      try {
        await this.fetcherService.deleteIncidentConfiguration(configName);
      }
      catch (error) {
        console.error(`onDeleteConfirmed(): caught error whilst deleting configuration ${configName}`);
        return;
      }
    });

    // fetch fields config
    try {
      this.savedIncidentConfigurations = await this.fetcherService.getSavedIncidentConfigurations();
      console.log('AppComponent: onDeleteConfirmed(): savedIncidentConfigurations:', this.savedIncidentConfigurations);
      this.fieldsConfigItems = this.buildFieldsConfigItems(this.savedIncidentConfigurations);
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
    console.log('AppComponent: onSaveClicked()');
    let config: FieldConfig = {
      name: this.loadedIncidentConfigName,
      incident: this.parsedIncidentJson,
      incidentFieldsConfig: this.buildFieldConfig(this.incidentFields),
      customFieldsConfig: this.buildFieldConfig(this.customFields),
      createInvestigation: this.createInvestigation,
      id: this.loadedIncidentConfigId
    };
    // console.log('AppComponent: onSaveClicked(): config:', config);
    try {
      let res = await this.fetcherService.saveIncidentConfiguration(config);
      this.messageWithAutoClear({severity: 'success', summary: 'Successful', detail: `Configuration '${this.selectedOpenConfig}' has been saved`});
    }
    catch (error) {
      console.error('onSaveClicked(): caught error saving field config:', error);
      return;
    }

    // Get Fields Configurations
    try {
      this.savedIncidentConfigurations = await this.fetcherService.getSavedIncidentConfigurations();
      // console.log('AppComponent: onSaveClicked(): savedIncidentConfigurations:', this.savedIncidentConfigurations);
      this.fieldsConfigItems = this.buildFieldsConfigItems(this.savedIncidentConfigurations);
    }
    catch (error) {
      console.error('AppComponent: onSaveClicked(): Caught error fetching fields configuration:', error);
    }
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



  onConfigOpened() {
    console.log('AppComponent: onConfigOpened()');
    this.showOpenDialog = false;
    const selectedConfig = this.savedIncidentConfigurations[this.selectedOpenConfig];

    this.parsedIncidentJson = selectedConfig.incident;
    console.log('AppComponent: onConfigOpened(): parsedIncidentJson:', this.parsedIncidentJson);
    this.buildIncidentFields(selectedConfig.incident);
    this.mergeLoadedFieldConfig(selectedConfig);
    this.loadedIncidentConfigName = selectedConfig.name;
    this.loadedIncidentConfigId = selectedConfig.id;
    this.createInvestigation = selectedConfig.createInvestigation;
    this.selectedOpenConfig = ''; // reset selection
  }



  onOpenCanceled() {
    console.log('AppComponent: onOpenCancelled()');
    this.showOpenDialog = false;
  }



  onBulkCreateClicked() {
    console.log('AppComponent: onBulkCreateClicked()');
    this.showBulkCreateDialog = true;
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
    this.showBulkCreateDialog = false;
    this.showBulkResultsDialog = true;
    this.changeDetector.detectChanges(); // trigger change detection

    this.bulkCreateResults = [];

    console.log('AppComponent: selectedBulkCreateConfigs:', this.selectedBulkCreateConfigs);

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
    Tests selected server
    Sets currentDemistoEndpointName and currentDemistoEndpointInit
    */
    console.log('AppComponent: switchCurrentDemistoEndpoint(): serverId:', serverId);

    const currentDemistoEndpointNameReselected = this.currentDemistoEndpointName === serverId;
    const noServerPreviouslySelected = !this.currentDemistoEndpointName;

    if (currentDemistoEndpointNameReselected) {
      console.log('AppComponent: switchCurrentDemistoEndpoint(): currentDemistoEndpointName was reselected.  Returning');
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
      if (testRes) {
        console.error('AppComponent: switchCurrentDemistoEndpoint(): Error loading Demisto endpoint:', testRes);
      }
      else {
        console.error('AppComponent: switchCurrentDemistoEndpoint(): Error loading Demisto endpoint:', error);
      }
    }

    if (this.currentDemistoEndpointInit) {
      // Refresh Demisto Incident Fields
      try {
        await this.fetchIncidentFieldDefinitions(this.currentDemistoEndpointName);

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
        console.error('AppComponent: switchCurrentDemistoEndpoint(): Caught error fetching Demisto incident fields:', error);
      }

      // Refresh Demisto Incident Types
      try {
        await this.fetchIncidentTypes(this.currentDemistoEndpointName);
      }
      catch (error) {
        console.error('AppComponent: switchCurrentDemistoEndpoint(): Caught error fetching Demisto incident types:', error);
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



  async onNewDemistoEndpoint() {
    console.log('AppComponent: onNewDemistoEndpoint()');
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



  async onDeleteDemistoEndpoint() {
    console.log(`onDeleteDemistoEndpoint(): ${this.demistoEndpointToDelete}`);
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
      this.mergeAndKeepLoadedFieldConfig();
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
            accept: () => this.mergeAndKeepLoadedFieldConfig(),
            reject: () => this.mergeLoadedFieldConfig(this.savedIncidentConfigurations[this.loadedIncidentConfigName]),
            acceptLabel: 'Keep Current Values & Selections',
            rejectLabel: 'Reset to Saved State',
            icon: ''
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



  async onLoadFromDemistoAccepted() {
    console.log('AppComponent: onLoadFromDemistoAccepted()');
    this.showLoadFromDemistoDialog = false;

    try {
      const res = await this.fetcherService.demistoIncidentImport(this.demistoIncidentToLoad, this.demistoEndpointToLoadFrom);
      console.log('AppComponent: onLoadFromDemistoAccepted(): res:', res);

      if (res.success) {
        this.parsedIncidentJson = res.incident;
        this.buildIncidentFields(this.parsedIncidentJson);
        this.messageWithAutoClear( { severity: 'success', summary: 'Success', detail: `Incident ${this.demistoIncidentToLoad} was successfully loaded from ${this.demistoEndpointToLoadFrom}`} );
        this.loadedIncidentConfigName = undefined;
        this.loadedIncidentConfigId = undefined;
        this.createInvestigation = true;
      }

      else if (res.error === `Query returned 0 results`) {
        this.messagesReplace( [{ severity: 'error', summary: 'Failure', detail: `Incident ${this.demistoIncidentToLoad} was not found on Demisto server ${this.demistoEndpointToLoadFrom}`}] );
      }

      else {
        this.messagesReplace( [{ severity: 'error', summary: 'Error', detail: `Error returned fetching incident ${this.demistoIncidentToLoad}: ${res.error}`}] );
      }
      this.demistoEndpointToLoadFrom = '';
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
    this.parsedIncidentJson = undefined;
    this.loadedIncidentConfigName = undefined;
    this.incidentFields = undefined;
    this.customFields = undefined;
    this.loadedIncidentConfigId = undefined;
    this.loadedIncidentConfigName = undefined;
    this.createInvestigation = true;
  }



}
