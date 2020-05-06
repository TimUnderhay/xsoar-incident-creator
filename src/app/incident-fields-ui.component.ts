import { Component, OnInit, OnChanges, ViewChildren, ChangeDetectorRef, Input, Inject, forwardRef, Output, EventEmitter, SimpleChanges, AfterViewInit } from '@angular/core';
import { FetcherService } from './fetcher-service';
import { DemistoEndpoint, DemistoEndpoints } from './types/demisto-endpoints';
import { ConfirmationService, SelectItem } from 'primeng/api';
import { IncidentFieldRowComponent } from './incident-field-row.component';
import { IncidentField, IncidentFields } from './types/incident-fields';
import { FetchedIncidentField, FetchedIncidentFieldDefinitions } from './types/fetched-incident-field';
import { FieldConfig, FieldsConfig, IncidentFieldsConfig } from './types/fields-config';
import { AppComponent } from './app.component';
import { PMessageOption } from './types/message-options';
import { InvestigationFields as investigationFields } from './investigation-fields';
import * as utils from './utils';

@Component({
    // tslint:disable-next-line: component-selector
    selector: 'incident-fields-ui',
    templateUrl: './incident-fields-ui.component.html'
  })

export class IncidentFieldsUIComponent implements OnInit, AfterViewInit, OnChanges {

  constructor(
      private fetcherService: FetcherService, // import our URL fetcher
      private confirmationService: ConfirmationService,
      private changeDetector: ChangeDetectorRef
  ) {}

  @ViewChildren('incidentField') incidentFieldRowComponents: IncidentFieldRowComponent[];
  @ViewChildren('customField') customFieldRowComponents: IncidentFieldRowComponent[];

  // API Inputs / Outputs
  @Input() currentDemistoEndpointName: string;
  @Input() currentDemistoEndpointInit: boolean;
  @Input() fetchedIncidentFieldDefinitions: FetchedIncidentFieldDefinitions; // the fields taken from Demisto
  @Input() savedIncidentConfigurations: FieldsConfig;
  
  // Incident Inputs / Outputs
  json: Object; // parsed json
  incidentFields: IncidentFields;
  customFields: IncidentFields; // the custom fields of our imported or loaded json
  get customFieldsLen(): number {
    return Object.keys(this.customFields).length;
  }
  @Input() loadedIncidentConfigName: string; // must clear when loaded from json or when current config is deleted
  @Input() loadedIncidentConfigId: string;
  createInvestigation: boolean; // sets createInvestigation: true in json when submitting an incident
  @Output() savedIncidentConfigurationsChanged = new EventEmitter<string>();
  @Output() saveAsButtonEnabledChange = new EventEmitter<boolean>();
  @Output() saveButtonEnabledChange = new EventEmitter<boolean>();
  @Output() reloadFieldDefinitions = new EventEmitter<string>();

  // PrimeNG Messages Popup Inputs / Outputs
  @Output() messagesReplace = new EventEmitter<PMessageOption[]>();
  @Output() messageWithAutoClear = new EventEmitter<PMessageOption>();
  

  // UI State
  displayIncidentFieldShortNames = true; // controls display options
  displayCustomFieldShortNames = true; // controls display options
  incidentFieldsSelectAllState = false;
  customFieldsSelectAllState = false;
  showSaveAsDialog = false;
  saveAsConfigName = ''; // for text label
  get saveAsOkayButtonDisabled(): boolean {
    return this.saveAsConfigName in this.savedIncidentConfigurations;
  }

  // Blacklisted field types
  blacklistedFieldTypes = ['timer'];

  // UI Labels
  createInvestigationButtonItems: SelectItem[] = [
    { value: true, label: 'Enabled' },
    { value: false, label: 'Disabled' }
  ];
  longNamesLabel = 'Short Names';
  shortNamesLabel = 'Long Names';

  // Save as dialog
  _saveAsButtonEnabled = false;
  set saveAsButtonEnabled(value) {
    this._saveAsButtonEnabled = value;
    this.saveAsButtonEnabledChange.emit(value);
  }



  ngOnInit() {
    // Fetch Sample Incident -- Comment out before committing to master
    // await this.getSampleIncident();
  }



  ngAfterViewInit() {}



  ngOnChanges(values: SimpleChanges) {
    // console.log('IncidentFieldsUIComponent: ngOnChanges(): values:', values);
    const foundLoadedIncidentConfigName = 'loadedIncidentConfigName' in values && values.loadedIncidentConfigName.currentValue;

    if (utils.changedSimpleChange('fetchedIncidentFieldDefinitions',  values)) {
      this.onFetchedIncidentFieldDefinitionsChanged();
    }

  }



  onLoadIncidentJson(json: Object) {
    this.json = json;
    this.buildIncidentFields(this.json);
    this.createInvestigation = true;
    this.saveAsButtonEnabled = true;
  }



  onConfigOpened(selectedConfig: FieldConfig) {
    // console.log('IncidentFieldsUIComponent: onConfigOpened()');
    this.json = selectedConfig.incident;
    // console.log('IncidentFieldsUIComponent: onConfigOpened(): json:', this.json);
    this.buildIncidentFields(selectedConfig.incident);
    this.mergeLoadedFieldConfig(selectedConfig);
    this.createInvestigation = selectedConfig.createInvestigation;
    this.saveAsButtonEnabled = true;
  }



  async loadFromDemisto(demistoIncidentToLoad: string, demistoEndpointToLoadFrom: string): Promise<boolean> {
    console.log('IncidentFieldsUIComponent: loadFromDemisto()');

    try {
      const res = await this.fetcherService.demistoIncidentImport(demistoIncidentToLoad, demistoEndpointToLoadFrom);
      console.log('IncidentFieldsUIComponent: loadFromDemisto(): res:', res);

      if (res.success) {
        this.json = res.incident;
        this.buildIncidentFields(this.json);
        this.messageWithAutoClear.emit( { severity: 'success', summary: 'Success', detail: `Incident ${demistoIncidentToLoad} was successfully loaded from ${demistoEndpointToLoadFrom}`} );
        this.loadedIncidentConfigName = undefined;
        this.loadedIncidentConfigId = undefined;
        this.createInvestigation = true;
        this.saveAsButtonEnabled = true;
      }

      else if (res.error === `Query returned 0 results`) {
        this.messagesReplace.emit( [{ severity: 'error', summary: 'Failure', detail: `Incident ${demistoIncidentToLoad} was not found on Demisto server ${demistoEndpointToLoadFrom}`}] );
      }

      else {
        this.messagesReplace.emit( [{ severity: 'error', summary: 'Error', detail: `Error returned fetching incident ${demistoIncidentToLoad}: ${res.error}`}] );
      }
      return true;
    }

    catch (error) {
      if ('message' in error) {
        error = error.message;
      }
      this.messagesReplace.emit( [{ severity: 'error', summary: 'Error', detail: `Error thrown pulling incident ${demistoIncidentToLoad}: ${error}`}] );
      return false;
    }
  }



  onToggleAllIncidentFields() {
    // console.log('IncidentFieldsUIComponent: onToggleAllIncidentFields()');
    // Object.keys(this.incidentFields).forEach( shortName => {
    for (const shortName in Object.keys(this.incidentFields)) {
      if (!this.incidentFields[shortName].locked) {
        this.incidentFields[shortName].enabled = this.incidentFieldsSelectAllState;
      }
    }
  }



  onToggleAllCustomFields() {
    // console.log('IncidentFieldsUIComponent: onToggleAllCustomFields()');
    // Object.keys(this.customFields).forEach( shortName => {
    for (const shortName in Object.keys(this.customFields)) {
      if (!this.customFields[shortName].locked) {
        this.customFields[shortName].enabled = this.customFieldsSelectAllState;
      }
    }
  }



  onResetAllFieldValues() {
    this.incidentFieldRowComponents.forEach( component => component.onResetValue(false) );
  }



  onResetAllCustomFieldValues() {
    this.customFieldRowComponents.forEach( component => component.onResetValue(true) );
  }



  async onReloadFieldDefinitions(serverId = this.currentDemistoEndpointName) {
    /*
    Reload Demisto Incident Fields and Merge

    Called from "Reload Definitions" button
    */

    console.log('IncidentFieldsUIComponent: onReloadFieldDefinitions()');
    this.reloadFieldDefinitions.emit(serverId);
  }



  async onFetchedIncidentFieldDefinitionsChanged(serverId = this.currentDemistoEndpointName) {
    /*
    Reload Demisto Incident Fields and Merge

    Called from onCreateBulkIncidents() and "Reload Definitions" button
    */
    console.log('IncidentFieldsUIComponent: onFetchedIncidentFieldDefinitionsChanged()');

    if (!this.customFields) {
      return;
    }
    Object.values(this.customFields).forEach(field => {
      // re-evaluate fields based on new defs

      const fieldFound = field.shortName in this.fetchedIncidentFieldDefinitions;
      let fieldTypesMatch;
      let fieldLongNamesMatch;
      if (fieldFound) {
        fieldTypesMatch = field.fieldType === this.fetchedIncidentFieldDefinitions[field.shortName].type;
        fieldLongNamesMatch = field.longName === this.fetchedIncidentFieldDefinitions[field.shortName].name;
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
        field.fieldType = this.fetchedIncidentFieldDefinitions[field.shortName].type;
        field.longName = this.fetchedIncidentFieldDefinitions[field.shortName].name;
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
        field.fieldType = this.fetchedIncidentFieldDefinitions[field.shortName].type;
        field.longName = this.fetchedIncidentFieldDefinitions[field.shortName].name;
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



  async onCreateIncident() {
    // console.log('IncidentFieldsUIComponent: onCreateIncident(): incidentFields:', this.incidentFields);
    // console.log('IncidentFieldsUIComponent: onCreateIncident(): customFields:', this.customFields);

    let incident: any = {
      serverId: this.currentDemistoEndpointName
    };
    if (this.createInvestigation) {
      incident['createInvestigation'] = true;
    }
    Object.values(this.incidentFields).forEach( (field: IncidentField) => {
      if (field.enabled) {
        incident[field.shortName] = field.value;
      }
    });
    // console.log('IncidentFieldsUIComponent: onCreateIncident():  incident:', incident);
    let customFields = {};
    Object.values(this.customFields).forEach( (field: IncidentField) => {
      if (field.enabled) {
        customFields[field.shortName] = field.value;
      }
    });
    if (Object.keys(customFields).length !== 0) {
      incident['CustomFields'] = customFields;
    }
    console.log('IncidentFieldsUIComponent: onCreateIncident(): incident:', incident);

    let res = await this.fetcherService.createDemistoIncident(incident);
    // console.log('IncidentFieldsUIComponent: onCreateIncident(): res:', res);
    if (!res.success) {
      const resultMessage = `Incident creation failed with Demisto status code ${res.statusCode}: "${res.statusMessage}"`;
      this.messagesReplace.emit( [{ severity: 'error', summary: 'Failure', detail: resultMessage}] );
    }
    else {
      const resultMessage = `Demisto incident created with id ${res.id}`;
      this.messagesReplace.emit( [{ severity: 'success', summary: 'Success', detail: resultMessage}] );
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



  onIncidentFieldChanged(key, value) {
    // console.log('IncidentFieldsUIComponent: onIncidentFieldChanged: key:', key);
    // console.log('IncidentFieldsUIComponent: onIncidentFieldChanged: value:', value);
    this.incidentFields[key] = value;
  }



  onCustomFieldChanged(key, value) {
    // console.log('IncidentFieldsUIComponent: onCustomFieldChanged: key:', key);
    // console.log('IncidentFieldsUIComponent: onCustomFieldChanged: value:', value);
    this.customFields[key] = value;
  }



  buildCustomFields(customFields) {
    /*
    Called from buildIncidentFields()
    */
    // console.log('IncidentFieldsUIComponent: buildCustomFields(): customFields:', customFields);
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

        const fetchedField = this.fetchedIncidentFieldDefinitions[shortName];
        for (const fieldType of this.blacklistedFieldTypes) {
          // skip blacklisted field types
          if (fieldType === fetchedField.type) {
            console.log(`Skipping field '${shortName}' of blacklisted type '${fieldType}'`)
            return;
          }
        }

        tmpField.longName = fetchedField.name;
        tmpField.locked = false;
        tmpField.fieldType = fetchedField.type;
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
    console.log('IncidentFieldsUIComponent: buildCustomFields(): customFields:', this.customFields);
  }



  buildIncidentFields(json: any) {
    /*
    Called from onIncidentJsonUploaded(), getSampleIncident(), onConfigOpened()
    Builds incidentFields from passed JSON
    Assigns result to this.incidentFields
    */
    console.log('IncidentFieldsUIComponent: buildIncidentFields(): incidentJson:', json);
    let incidentFields: IncidentFields = {};
    let skippedInvestigationFields = [];

    Object.keys(json).forEach( shortName => {
      // console.log('IncidentFieldsUIComponent: buildIncidentFields(): shortName:', shortName);
      let value = json[shortName];

      if (investigationFields.includes(shortName)) {
        skippedInvestigationFields.push(shortName);
        return;
      }

      if (shortName === 'CustomFields') {
        this.buildCustomFields(json.CustomFields);
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

      if (!(shortName in this.fetchedIncidentFieldDefinitions)) {
        console.warn(`Incident field '${shortName}' was not found.  It's probably an investigation field and this can safely be ignored.`);
        return;
      }

      const fetchedField = this.fetchedIncidentFieldDefinitions[shortName];

      for (const fieldType of this.blacklistedFieldTypes) {
        // skip blacklisted field types
        if (fieldType === fetchedField.type) {
          console.log(`Skipping field '${shortName}' of blacklisted type '${fieldType}'`)
          return;
        }
      }

      if (fetchedField.isReadOnly) {
        console.warn(`Skipping read-only incident field '${shortName}'`);
        return;
      }

      incidentFields[shortName] = {
        shortName,
        longName: fetchedField.name,
        enabled: false,
        locked: false,
        value,
        originalValue: value,
        fieldType: fetchedField.type,
        custom: false,
        mappingMethod: 'static',
        jmesPath: '',
        permitNullValue: false
      };
    } );

    this.incidentFields = incidentFields;
    console.log(`Skipped investigation fields:`, skippedInvestigationFields);
    console.log('IncidentFieldsUIComponent: buildIncidentFields(): incidentFields:', this.incidentFields);
  }



  mergeAndKeepLoadedFieldConfig() {
    console.log('IncidentFieldsUIComponent: mergeAndKeepLoadedFieldConfig()');
    // Attempts to keep current field selections and values
    const incidentFieldsDefined = this.incidentFields;
    const customFieldsDefined = this.customFields;

    if (!incidentFieldsDefined) {
      console.log('IncidentFieldsUIComponent: mergeAndKeepLoadedFieldConfig(): incidentFields not defined.  Returning');
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

    console.log('IncidentFieldsUIComponent: mergeLoadedFieldConfig(): savedIncidentConfig:', savedIncidentConfig);

    for (const field of Object.values(savedIncidentConfig.incidentFieldsConfig)) {
      const shortName = field.shortName;
      if (!(shortName in this.incidentFields)) {
        console.warn(`Loaded incident contained incident field '${shortName}', which was not available for inclusion.  It may have previously been skipped due to it being read-only or a blacklisted field type, such as a timer field`)
        continue;
      }
      if (!this.incidentFields[shortName].locked) {
        this.incidentFields[shortName].enabled = field.enabled;
      }
      this.incidentFields[shortName].value = field.value;
      this.incidentFields[shortName].originalValue = field.value;
    }

    for (const field of Object.values(savedIncidentConfig.customFieldsConfig)) {
      const shortName = field.shortName;
      if (!(shortName in this.customFields)) {
        console.warn(`Loaded incident contained incident custom field '${shortName}', which was not available for inclusion.  It may have previously been skipped due to it being read-only or a blacklisted field type, such as a timer field`)
        continue;
      }
      if (!this.customFields[shortName].locked) {
        this.customFields[shortName].enabled = field.enabled;
      }
      this.customFields[shortName].value = field.value;
      this.customFields[shortName].originalValue = field.value;
    }

    console.log('IncidentFieldsUIComponent: mergeLoadedFieldConfig(): incidentFields:', this.incidentFields);
    // this.incidentFields = JSON.parse(JSON.stringify(this.incidentFields)); // hack deep copy to trigger change detection
    // this.customFields = JSON.parse(JSON.stringify(this.customFields)); // hack deep copy to trigger change detection
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



  async getSampleIncident() {
    let res = await this.fetcherService.getSampleIncident();
    this.json = res;
    console.log('IncidentFieldsUIComponent: getSampleIncident(): json:', this.json);
    this.buildIncidentFields(this.json);
    this.saveAsButtonEnabled = true;
  }



  async onSaveClicked() {
    console.log('IncidentFieldsUIComponent(): onSaveClicked()');
    let config: FieldConfig = {
      name: this.loadedIncidentConfigName,
      incident: this.json,
      incidentFieldsConfig: this.buildFieldConfig(this.incidentFields),
      customFieldsConfig: this.buildFieldConfig(this.customFields),
      createInvestigation: this.createInvestigation,
      id: this.loadedIncidentConfigId
    };
    // console.log('IncidentFieldsUIComponent: onSaveClicked(): config:', config);
    try {
      let res = await this.fetcherService.saveIncidentConfiguration(config);
    }
    catch (error) {
      console.error('IncidentFieldsUIComponent: onSaveClicked(): caught error saving field config:', error);
      return;
    }
  }



  onSaveAsClicked() {
    console.log('IncidentFieldsUIComponent: onSaveAsClicked()');
    this.showSaveAsDialog = true;
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      document.getElementsByClassName('saveAsDialog')[0].getElementsByTagName('input')[0].focus();
    }, 100);
  }



  async onSaveAsAccepted() {
    console.log('IncidentFieldsUIComponent: onSaveAsAccepted()');

    let newIncidentConfigName: string;

    const incident_config: FieldConfig = {
      name: this.saveAsConfigName,
      incident: this.json,
      incidentFieldsConfig: this.buildFieldConfig(this.incidentFields),
      customFieldsConfig: this.buildFieldConfig(this.customFields),
      createInvestigation: this.createInvestigation
    };
    try {
      const res = await this.fetcherService.saveNewIncidentConfiguration(incident_config);
      this.messageWithAutoClear.emit({severity: 'success', summary: 'Successful', detail: `Configuration '${this.saveAsConfigName}' has been saved`});
      newIncidentConfigName = this.saveAsConfigName;
      this.saveAsConfigName = '';
    }
    catch (error) {
      console.error('IncidentFieldsUIComponent: onSaveAsAccepted(): caught error saving field config:', error);
      return;
    }

    // Update Fields Configurations
    this.savedIncidentConfigurationsChanged.emit(newIncidentConfigName);
    this.showSaveAsDialog = false;
  }



  onSaveAsCanceled() {
    console.log('IncidentFieldsUIComponent: onSaveAsCanceled()');
    this.showSaveAsDialog = false;
    this.saveAsConfigName = '';
  }




}
