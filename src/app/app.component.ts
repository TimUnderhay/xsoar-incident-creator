import { Component, OnInit, ViewChildren } from '@angular/core';
import { FetcherService } from './fetcher-service';
import { DemistoProperties } from './types/demisto-properties';
import { User } from './types/user';
import { ApiStatus } from './types/api-status';
import { SelectItem } from 'primeng/api';
import { IncidentFields, CustomFields, CustomField, IncidentField } from './types/incident-fields';
import { FieldDisplayComponent } from './field-display.component';
import { DemistoIncidentField, DemistoIncidentFields } from './types/demisto-incident-field';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})



export class AppComponent implements OnInit {

  constructor( private fetcherService: FetcherService ) {} // import our URL fetcher

  @ViewChildren(FieldDisplayComponent) fieldDisplayComponents: FieldDisplayComponent[];

  demistoProperties: DemistoProperties = {
    url: '',
    apiKey: '',
    trustAny: true
  };

  testResult = 'initial';
  testResultClass = '';
  loggedInUser: User;
  serverApiInit = false;
  resultMessage: string;
  resultSuccess: boolean;
  shortNamesLabel = 'Short Names';
  longNamesLabel = 'Long Names';

  // for p-messages
  messages = [];

  // Options for PrimeNG Components
  testTimeout: ReturnType<typeof setTimeout> = null;

  file: File;
  fileData: any;

  createInvestigationButtonOptions: SelectItem[] = [
    { value: true, label: 'Enabled' },
    { value: false, label: 'Disabled' }
  ];
  createInvestigation = true;

  demistoIncidentFields: DemistoIncidentFields; // the fields taken from Demisto
  incidentFields: IncidentFields; // the fields of our imported JSON
  customFields: CustomFields;
  displayIncidentFieldShortNames = true;
  displayCustomFieldShortNames = true;

  investigationFields = ['id', 'account', 'created', 'modified', 'ShardID', 'account', 'activated', 'autime', 'canvases', 'closeNotes', 'closeReason', 'closed', 'closingUserId', 'created', 'droppedCount', 'dueDate', 'hasRole', 'id', 'investigationId', 'isPlayground', 'lastOpen', 'linkedCount', 'linkedIncidents', 'modified', 'notifyTime', 'openDuration', 'parent', 'playbookId', 'previousRoles', 'rawCategory', 'rawCloseReason', 'rawJSON', 'rawName', 'rawPhase', 'rawType', 'reason', 'runStatus', 'sla', 'sortValues', 'sourceBrand', 'sourceInstance', 'status', 'version' ]; // it may become necessary to permit some of these fields in the future



  async ngOnInit() {
    // Get Logged In User
    try {
      this.loggedInUser = await this.fetcherService.getLoggedInUser();
      console.log('LoggedInUser:', this.loggedInUser);
    }
    catch (err) {
      console.log('Caught error fetching logged in user:', err);
    }

    // API Init
    try {
      let res: ApiStatus = await this.fetcherService.getApiStatus();
      this.serverApiInit = res.initialised;
      if (this.serverApiInit) {
        this.messages = [{ severity: 'success', summary: 'Success', detail: 'Demisto API communication is initialised'}];
      }
      else {
        this.messages = [{ severity: 'error', summary: 'Failure', detail: 'Demisto API communication is not initialised!'}];
      }
      this.testTimeout = setTimeout( () => {
        this.messages = [];
        this.testTimeout = null;
      } , 5000 );
      if (this.serverApiInit) {
        this.demistoProperties.url = res.url;
        this.demistoProperties.trustAny = res.trust;
      }
      console.log('Demisto Server API:', res);
    }
    catch (err) {
      console.log('Caught error fetching Demisto server API status:', err);
    }

    // Demisto Incident Fields
    try {
      let demistoIncidentFields: DemistoIncidentField[] = await this.fetcherService.getIncidentFields();
      let tmpFields: DemistoIncidentFields = {};
      demistoIncidentFields.forEach( (field: DemistoIncidentField) => {
        let shortName = field.cliName;
        tmpFields[shortName] = field;
      });
      this.demistoIncidentFields = tmpFields;
      console.log('demistoIncidentFields:', this.demistoIncidentFields);


      // for identification purposes, output all the field types
      let fieldTypes = demistoIncidentFields.reduce( (result: string[], field: DemistoIncidentField) => {
        if (!result.includes(field.type)) {
          result.push(field.type);
        }
        return result;
      }, []);
      console.log('fieldTypes:', fieldTypes);
    }
    catch (err) {
      console.log('Caught error fetching Demisto incident fields:', err);
    }

    // Fetch Sample Incident -- Uncomment for testing
    // await this.getSampleIncident();

  }



  async testAPI(): Promise<any> {
    try {
      let result = await this.fetcherService.testDemisto(this.demistoProperties);
      if (this.testTimeout) {
        clearTimeout(this.testTimeout);
        this.testTimeout = null;
      }
      console.log('testCredentials() result:', result);
      if ( 'success' in result && result.success ) {
        // successful
        this.testResultClass = 'success';
        this.testResult = 'Test successful';
        this.serverApiInit = true;
        this.messages = [{ severity: 'success', summary: 'Success', detail: 'Demisto API communication is initialised'}];
        this.testTimeout = setTimeout( () => {
          this.messages = [];
          this.testTimeout = null;
        } , 5000 );
      }
      else if ( 'success' in result && !result.success ) {
        // unsuccessful
        let err = 'statusMessage' in result ? result.statusMessage : result.error;
        if ('statusCode' in result) {
          this.testResult = `Test failed with code ${result.statusCode}: "${err}"`;
          this.messages = [{
            severity: 'error',
            summary: 'Failure',
            detail: `Demisto API communication is not initialised. ${this.testResult}`
          }];
        }
        else {
          this.testResult = `Test failed with error: "${err}"`;
          this.messages = [{
            severity: 'error',
            summary: 'Failure',
            detail: `Demisto API communication is not initialised. ${this.testResult}`
          }];
        }
        this.testResultClass = 'failure';
        this.serverApiInit = false;
      }
    }
    catch (error) {
      this.testResult = `Test failed with error: ${error.message || error}`;
      this.messages = [{
        severity: 'error',
        summary: 'Failure',
        detail: `Demisto API communication is not initialised. ${this.testResult}`
      }];
      this.testResultClass = 'failure';
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
    let tmpCustomFields: CustomFields = {};
    Object.keys(customFields).forEach( shortName => {
      let value = customFields[shortName];
      let tmpField: CustomField = {
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



  buildIncidentFields(incident) {
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



  onFileUpload(data: { files: File }, uploadRef) {
    this.file = data.files[0];
    console.log('onFileUpload(): file:', this.file);
    try {
      let reader = new FileReader();
      reader.onloadend = (error: any) => {
        // console.log('result:', reader.result);
        this.fileData = JSON.parse(reader.result as string);
        console.log('onFileUpload(): fileData:', this.fileData);
        this.buildIncidentFields(this.fileData);
        uploadRef.clear();
      };
      reader.readAsText(data.files[0]);
    }
    catch (error) {
      console.error('Error parsing uploaded file:', error);
    }
  }



  async getSampleIncident() {
    let res = await this.fetcherService.getSampleIncident();
    this.fileData = JSON.parse(res);
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
      let demistoIncidentFields: DemistoIncidentField[] = await this.fetcherService.getIncidentFields();
      let tmpFields = {};
      demistoIncidentFields.forEach(field => {
        let shortName = field.cliName;
        tmpFields[shortName] = field;
      });
      this.demistoIncidentFields = tmpFields;
      console.log('onReloadFieldDefinitions(): demistoIncidentFields:', this.demistoIncidentFields);

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

}
