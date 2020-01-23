import { Component, OnInit, ViewChildren } from '@angular/core';
import { FetcherService } from './fetcher-service';
import { DemistoProperties } from './types/demisto-properties';
import { User } from './types/user';
import { ApiStatus } from './types/api-status';
import { SelectItem } from 'primeng/api';
import { IncidentField, IncidentFields } from './types/incident-fields';
import { FieldDisplayComponent } from './field-display.component';
import { DemistoIncidentField, DemistoIncidentFields } from './types/demisto-incident-field';
import { FieldConfig, FieldsConfig, IncidentFieldsConfig } from './types/fields-config';
import { ConfirmationService } from 'primeng/api';
import { PMessageOption } from './types/message-options';
import { BulkCreateResult } from './types/bulk-create-result';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})



export class AppComponent implements OnInit {

  constructor( private fetcherService: FetcherService, private confirmationService: ConfirmationService ) {} // import our URL fetcher

  @ViewChildren(FieldDisplayComponent) fieldDisplayComponents: FieldDisplayComponent[];

  private investigationFields = ['id', 'account', 'created', 'modified', 'ShardID', 'account', 'activated', 'autime', 'canvases', 'closeNotes', 'closeReason', 'closed', 'closingUserId', 'created', 'droppedCount', 'dueDate', 'hasRole', 'id', 'investigationId', 'isPlayground', 'lastOpen', 'linkedCount', 'linkedIncidents', 'modified', 'notifyTime', 'openDuration', 'parent', 'playbookId', 'previousRoles', 'rawCategory', 'rawCloseReason', 'rawJSON', 'rawName', 'rawPhase', 'rawType', 'reason', 'runStatus', 'sla', 'sortValues', 'sourceBrand', 'sourceInstance', 'status', 'version' ]; // it may become necessary to permit some of these fields in the future

  demistoProperties: DemistoProperties = {
    url: '',
    apiKey: '',
    trustAny: true
  };

  loggedInUser: User;
  serverApiInit = false;
  resultMessage: string;
  resultSuccess: boolean;
  longNamesLabel = 'Short Names';
  shortNamesLabel = 'Long Names';

  // for p-messages
  messages: PMessageOption[] = [];
  messagesClearTimeout: ReturnType<typeof setTimeout> = null;

  fileData: any; // parsed json

  createInvestigation = true;
  createInvestigationButtonOptions: SelectItem[] = [
    { value: true, label: 'Enabled' },
    { value: false, label: 'Disabled' }
  ];

  demistoIncidentFields: DemistoIncidentFields; // the fields taken from Demisto
  incidentFields: IncidentFields; // the fields of our imported JSON
  customFields: IncidentFields; // the custom fields of our imported json
  displayIncidentFieldShortNames = true;
  displayCustomFieldShortNames = true;

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

  // bulk results
  showBulkResultsDialog = false;
  bulkCreateResults: BulkCreateResult[] = [];




  get saveAsDisabled(): boolean {
    return this.saveAsConfigName in this.fieldsConfigurations;
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

    // API Init
    await this.demistoApiInit();

    if (this.serverApiInit) {
      // Demisto Incident Fields
      try {
        await this.getDemistoIncidentFields();
      }
      catch (error) {
        console.error('AppComponent: ngOnInit(): Caught error fetching Demisto incident fields:', error);
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
    }

    // Fetch Sample Incident -- Uncomment for testing
    // await this.getSampleIncident();

  }



  async getAllFieldConfigurations() {
    return this.fetcherService.getAllFieldConfigurations();
  }



  messageAdd(message: PMessageOption) {
    this.messages.push();
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
    console.log('demistoApiInit()');
    try {
      let res: ApiStatus = await this.fetcherService.getApiStatus(); // checks whether the server has already initialised Demisto communication.  This is does not actually perform a new test.
      this.serverApiInit = res.initialised;
      if (this.serverApiInit) {
        this.messageWithAutoClear( { severity: 'success', summary: 'Success', detail: 'Demisto API communication is initialised'});

        this.demistoProperties.url = res.url;
        this.demistoProperties.trustAny = res.trust;
      }
      else {
        this.messageWithAutoClear( { severity: 'error', summary: 'Failure', detail: 'Demisto API communication is not initialised!'} );
      }
      console.log('Demisto Server API:', res);
    }
    catch (err) {
      console.log('Caught error fetching Demisto server API status:', err);
    }
  }



  async getDemistoIncidentFields(): Promise<boolean> {
    console.log('getDemistoIncidentFields()');
    try {
      let demistoIncidentFields: DemistoIncidentField[] = await this.fetcherService.getIncidentFields();
      let tmpFields: DemistoIncidentFields = {};
      demistoIncidentFields.forEach( (field: DemistoIncidentField) => {
        let shortName = field.cliName;
        tmpFields[shortName] = field;
      });
      this.demistoIncidentFields = tmpFields;
      console.log('demistoIncidentFields:', this.demistoIncidentFields);
      return true;

      // for identification purposes, output all the field types
      /*let fieldTypes = demistoIncidentFields.reduce( (result: string[], field: DemistoIncidentField) => {
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



  async testAPI(): Promise<any> {
    console.log('testAPI()');
    let testResult: string;
    try {
      let result = await this.fetcherService.testDemisto(this.demistoProperties);
      if (this.messagesClearTimeout) {
        clearTimeout(this.messagesClearTimeout);
        this.messagesClearTimeout = null;
      }
      console.log('testCredentials() result:', result);
      if ( 'success' in result && result.success ) {
        // successful
        testResult = 'Test successful';
        this.serverApiInit = true;
        this.messageWithAutoClear({ severity: 'success', summary: 'Success', detail: 'Demisto API communication is initialised'});
        await this.onReloadFieldDefinitions();
      }
      else if ( 'success' in result && !result.success ) {
        // unsuccessful
        let err = 'statusMessage' in result ? result.statusMessage : result.error;
        if ('statusCode' in result) {
          testResult = `Test failed with code ${result.statusCode}: "${err}"`;
          this.messages = [{
            severity: 'error',
            summary: 'Failure',
            detail: `Demisto API communication is not initialised. ${testResult}`
          }];
        }
        else {
          testResult = `Test failed with error: "${err}"`;
          this.messages = [{
            severity: 'error',
            summary: 'Failure',
            detail: `Demisto API communication is not initialised. ${testResult}`
          }];
        }
        this.serverApiInit = false;
      }
    }
    catch (error) {
      testResult = `Test failed with error: ${error.message || error}`;
      this.messages = [{
        severity: 'error',
        summary: 'Failure',
        detail: `Demisto API communication is not initialised. ${testResult}`
      }];
      this.serverApiInit = false;
    }
  }



  async onIncidentSubmit() {
    // console.log('onIncidentSubmit(): incidentFields:', this.incidentFields);
    // console.log('onIncidentSubmit(): customFields:', this.customFields);

    let incident: any = {};
    if (this.createInvestigation) {
      incident['createInvestigation'] = true;
    }
    Object.values(this.incidentFields).forEach( (field: IncidentField) => {
      if (field.enabled) {
        incident[field.shortName] = field.value;
      }
    });
    // console.log('incident:', incident);
    let customFields = {};
    Object.values(this.customFields).forEach( (field: IncidentField) => {
      if (field.enabled) {
        customFields[field.shortName] = field.value;
      }
    });
    if (Object.keys(customFields).length !== 0) {
      incident['CustomFields'] = customFields;
    }
    console.log('incident:', incident);

    let res = await this.fetcherService.createDemistoIncident(incident);
    // console.log('res:', res);
    this.resultSuccess = res.success;
    if (!res.success) {
      this.resultMessage = `Incident creation failed with Demisto status code ${res.statusCode}: "${res.statusMessage}"`;
      this.messages = [{ severity: 'error', summary: 'Failure', detail: this.resultMessage}];
    }
    else {
      this.resultMessage = `Demisto incident created with id ${res.id}`;
      this.messages = [{ severity: 'success', summary: 'Success', detail: this.resultMessage}];
    }

  }



  buildCustomFields(customFields) {
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
      if (shortName in this.demistoIncidentFields) {
        tmpField.longName = this.demistoIncidentFields[shortName].name;
        tmpField.locked = false;
        tmpField.fieldType = this.demistoIncidentFields[shortName].type;
        if (['attachments'].includes(tmpField.fieldType) ) {
          tmpField.locked = true;
          tmpField.lockedReason = 'This field type is not supported for import';
        }
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

      if (!(shortName in this.demistoIncidentFields)) {
        console.error('Field not found:', shortName);
        return;
      }

      incidentFields[shortName] = {
        shortName,
        longName: this.demistoIncidentFields[shortName].name,
        enabled: false,
        locked: false,
        value,
        originalValue: value,
        fieldType: this.demistoIncidentFields[shortName].type,
        custom: false
      };
      // }

    });
    this.incidentFields = incidentFields;
    console.log('buildIncidentFields(): incidentFields:', this.incidentFields);
  }



  loadIncidentFields(config: FieldConfig) {
    let incident = config.incident;
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

      if (!(shortName in this.demistoIncidentFields)) {
        console.error('Field not found:', shortName);
        return;
      }

      incidentFields[shortName] = {
        shortName,
        longName: this.demistoIncidentFields[shortName].name,
        enabled: false,
        locked: false,
        value,
        originalValue: value,
        fieldType: this.demistoIncidentFields[shortName].type,
        custom: false
      };
    });

    this.incidentFields = incidentFields;

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

    console.log('loadIncidentFields(): incidentFields:', this.incidentFields);
  }



  onFileUpload(data: { files: File }, uploadRef) {
    let file = data.files[0];
    console.log('onFileUpload(): file:', file);
    try {
      let reader = new FileReader();
      reader.onloadend = (error: any) => {
        // console.log('result:', reader.result);
        this.fileData = JSON.parse(reader.result as string);
        console.log('onFileUpload(): fileData:', this.fileData);
        this.buildIncidentFields(this.fileData);
        uploadRef.clear(); // allow future uploads
        this.loadedConfigName = undefined;
        this.loadedConfigId = undefined;
      };
      reader.readAsText(data.files[0]);
    }
    catch (error) {
      console.error('Error parsing uploaded file:', error);
    }
  }



  async getSampleIncident() {
    let res = await this.fetcherService.getSampleIncident();
    this.fileData = res;
    console.log('getSampleIncident(): fileData:', this.fileData);
    this.buildIncidentFields(this.fileData);
  }



  onSelectAllFields() {
    Object.keys(this.incidentFields).forEach( shortName => {
      if (!this.incidentFields[shortName].locked) {
        this.incidentFields[shortName].enabled = true;
      }
    });
  }



  onClearAllFields() {
    Object.keys(this.incidentFields).forEach( shortName => {
      this.incidentFields[shortName].enabled = false;
    });
  }



  onSelectAllCustomFields() {
    Object.keys(this.customFields).forEach( shortName => {
      if (!this.customFields[shortName].locked) {
        this.customFields[shortName].enabled = true;
      }
    });
  }



  onClearAllCustomFields() {
    Object.keys(this.customFields).forEach( shortName => {
      this.customFields[shortName].enabled = false;
    });
  }



  async onReloadFieldDefinitions() {
    // Reload Demisto Incident Fields and Merge
    console.log('onReloadFieldDefinitions()');
    try {
      let success = await this.getDemistoIncidentFields();
      if (!success) {
        console.log('onReloadFieldDefinitions(): incident fields fetch was unsuccessful.  Aborting.');
        return;
      }

      if (!this.customFields) {
        return;
      }
      Object.values(this.customFields).forEach(field => {
        // re-evaluate fields based on new defs

        const fieldFound = field.shortName in this.demistoIncidentFields;
        let fieldTypesMatch;
        let fieldLongNamesMatch;
        if (fieldFound) {
          fieldTypesMatch = field.fieldType === this.demistoIncidentFields[field.shortName].type;
          fieldLongNamesMatch = field.longName === this.demistoIncidentFields[field.shortName].name;
        }

        if (!fieldFound) {
          // look for fields that have been removed from the feed definition
          console.log(`Field ${field.shortName} has been removed from the Demisto field definitions`);
          field.enabled = false;
          field.locked = true;
          field.lockedReason = 'This field cannot be imported as it is not defined in Demisto';
          field.fieldType = 'undefined';
          delete field.longName;
        }

        if (fieldFound && (!fieldTypesMatch || !fieldLongNamesMatch)) {
          // look for fields that have changed in the feed definition
          console.log(`Field ${field.shortName} has changed in the Demisto field definitions`);
          console.log(`fieldTypesMatch: ${fieldTypesMatch}, fieldLongNamesMatch: ${fieldLongNamesMatch}`);
          field.fieldType = this.demistoIncidentFields[field.shortName].type;
          field.longName = this.demistoIncidentFields[field.shortName].name;
          field.locked = false;
          delete field.lockedReason;
          // field.enabled = false;
        }

        if (fieldFound && field.locked && field.fieldType !== 'attachments') {
          // look for fields that have been added to the feed definition
          console.log(`Field ${field.shortName} has been added to the Demisto field definitions`);
          field.enabled = false;
          field.locked = false;
          if ('lockedReason' in field) {
            delete field.lockedReason;
          }
          field.fieldType = this.demistoIncidentFields[field.shortName].type;
          field.longName = this.demistoIncidentFields[field.shortName].name;
        }

        if (fieldFound && field.fieldType === 'attachments') {
          // look for attachment fields and disable them
          console.log(`Disabling attachment field ${field.shortName}`);
          field.enabled = false;
          field.locked = true;
          field.lockedReason = 'This field type is not supported for import';
        }
      });

    }
    catch (err) {
      console.log('onReloadFieldDefinitions(): Caught error fetching Demisto incident fields:', err);
    }
  }



  onResetAllFieldValues() {
    this.fieldDisplayComponents.forEach( component => component.onResetValue(false) );
  }



  onResetAllCustomFieldValues() {
    this.fieldDisplayComponents.forEach( component => component.onResetValue(true) );
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



  countEnabledFields(): number {
    if (!this.incidentFields) {
      return;
    }
    let enabledFields = 0;
    Object.values(this.incidentFields).forEach( field => {
      if (field.enabled) {
        enabledFields += 1;
      }
    } );
    Object.values(this.customFields).forEach( field => {
      if (field.enabled) {
        enabledFields += 1;
      }
    } );
    return enabledFields;
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
      accept: () => this.onDeleteConfirmed()
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
    try {
      let res = await this.fetcherService.saveFieldConfiguration(config);
      this.messageWithAutoClear({severity: 'success', summary: 'Successful', detail: `Configuration '${this.selectedOpenConfig}' has been saved`});
    }
    catch (error) {
      console.error('onSaveClicked(): caught error saving field config:', error);
      return;
    }

    // Fields Configurations
    try {
      this.fieldsConfigurations = await this.getAllFieldConfigurations();
      console.log('AppComponent: onSaveClicked(): fieldsConfigurations:', this.fieldsConfigurations);
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
    let selectedConfig = this.fieldsConfigurations[this.selectedOpenConfig];
    this.fileData = selectedConfig.incident;
    this.loadIncidentFields(selectedConfig);
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



  async onBulkCreateSubmit() {
    console.log('onBulkCreateSubmit()');
    await this.onReloadFieldDefinitions();
    this.showBulkCreateDialog = false;
    this.showBulkResultsDialog = true;
    setTimeout( () => {} ); // trigger change detection

    this.bulkCreateResults = [];
    this.selectedBulkCreateConfigs.forEach( async (configName) => {
      /*
      Steps to complete:

      1.  Load config
      2.  Check for keys that can't be pushed
      3.  Display them in a column
      4.  Push case with all other fields
      5.  Display results in a column
      */
      console.log('onBulkCreateSubmit(): configName:', configName);
      let selectedConfig = this.fieldsConfigurations[configName];
      let skippedFields: string[] = [];

      let newIncident = {
        createInvestigation: selectedConfig.createInvestigation
      };

      Object.values(selectedConfig.incidentFieldsConfig).forEach( incidentFieldConfig => {
        const fieldName = incidentFieldConfig.shortName;
        if (!incidentFieldConfig.enabled) {
          // silently skip non-enabled fields
          return;
        }
        if (!(fieldName in this.demistoIncidentFields)) {
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
        if (!(fieldName in this.demistoIncidentFields)) {
          // skip fields which don't exist in Demisto config
          skippedFields.push(fieldName);
          return;
        }
        newIncident['CustomFields'][fieldName] = incidentFieldConfig.value;
      });

      console.log('onBulkCreateSubmit(): newIncident:', newIncident);

      // now submit the incident
      let res = await this.fetcherService.createDemistoIncident(newIncident);
      if (!res.success) {
        const error = res.statusMessage;
        this.bulkCreateResults.push({configName, success: false, error});
      }
      else {
        this.bulkCreateResults.push({configName, success: true, skippedFields, incidentId: res.id});
      }


    });

    console.log('onBulkCreateSubmit(): bulkCreateResults:', this.bulkCreateResults);

    this.selectedBulkCreateConfigs = []; // reset selection
  }



  async onClickDemistoInvestigateUrl(id: number) {
    console.log('onClickDemistoInvestigateUrl(): id:', id);
    await this.fetcherService.createInvestigation(id);
    const url = `${this.demistoProperties.url}/#/incident/${id}`;
    window.open(url, '_blank');
  }

}
