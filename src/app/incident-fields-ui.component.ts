import { Component, OnInit, OnChanges, ViewChildren, ChangeDetectorRef, Input, Inject, forwardRef, Output, EventEmitter, SimpleChanges } from '@angular/core';
import { FetcherService } from './fetcher-service';
import { DemistoEndpoint, DemistoEndpoints } from './types/demisto-endpoints';
import { ConfirmationService } from 'primeng/api';
import { SelectItem } from 'primeng/api';
import { FieldDisplayComponent } from './field-display.component';
import { IncidentField, IncidentFields } from './types/incident-fields';
import { FetchedIncidentField, FetchedIncidentFieldDefinitions } from './types/fetched-incident-field';
import { AppComponent } from './app.component';
import { PMessageOption } from './types/message-options';

@Component({
    // tslint:disable-next-line: component-selector
    selector: 'incident-fields-ui',
    templateUrl: './incident-fields-ui.component.html'
  })

export class IncidentFieldsUIComponent implements OnInit, OnChanges {

  constructor(
      private fetcherService: FetcherService, // import our URL fetcher
      private confirmationService: ConfirmationService,
      private changeDetector: ChangeDetectorRef,
      @Inject(forwardRef(() => AppComponent )) private parentComponent: AppComponent
  ) {}

  @ViewChildren('incidentField') fieldDisplayComponents: FieldDisplayComponent[];
  @ViewChildren('customField') customFieldDisplayComponents: FieldDisplayComponent[];

  // API Inputs / Outputs
  @Input() currentDemistoEndpointName: string;
  @Input() currentDemistoEndpointInit: boolean;
  @Input() fetchedIncidentFieldDefinitions: FetchedIncidentFieldDefinitions; // the fields taken from Demisto
  
  // Incident Inputs / Outputs
  @Input() parsedIncidentJson: any; // parsed json
  @Input() incidentFields: IncidentFields;
  @Output() incidentFieldsChange: EventEmitter<IncidentFields> = new EventEmitter();
  @Input() customFields: IncidentFields; // the custom fields of our imported or loaded json
  @Output() customFieldsChange: EventEmitter<IncidentFields> = new EventEmitter();
  get customFieldsLen(): number {
    return Object.keys(this.customFields).length;
  }
  @Input() loadedIncidentConfigName: string; // must clear when loaded from json or when current config is deleted
  @Input() createInvestigation: boolean; // sets createInvestigation: true in json when submitting an incident
  @Output() createInvestigationChange: EventEmitter<boolean> = new EventEmitter();

  // PrimeNG Messages Popup Inputs / Outputs
  @Input() messages: PMessageOption[] = [];
  @Output() messagesChange: EventEmitter<PMessageOption[]> = new EventEmitter();

  // UI State
  displayIncidentFieldShortNames = true; // controls display options
  displayCustomFieldShortNames = true; // controls display options

  // UI Labels
  createInvestigationButtonOptions: SelectItem[] = [
    { value: true, label: 'Enabled' },
    { value: false, label: 'Disabled' }
  ];
  longNamesLabel = 'Short Names';
  shortNamesLabel = 'Long Names';
  incidentFieldsSelectAllState = false;
  customFieldsSelectAllState = false;



  ngOnInit() {}



  ngOnChanges(values: SimpleChanges) {
    // console.log('IncidentFieldsUIComponent: ngOnChanges(): values:', values);
    const incidentFieldsFound = 'incidentFields' in values;
    const isFirstChange = incidentFieldsFound && values.incidentFields.isFirstChange();
    const sameIdentity = incidentFieldsFound && !isFirstChange && values.incidentFields.currentValue === values.incidentFields.previousValue;
    if (incidentFieldsFound && !isFirstChange && !sameIdentity) {
      this.incidentFieldsSelectAllState = false;
      this.customFieldsSelectAllState = false;
    }
  }



  onToggleAllIncidentFields() {
    // console.log('IncidentFieldsUIComponent: onToggleAllIncidentFields()')
    Object.keys(this.incidentFields).forEach( shortName => {
      if (!this.incidentFields[shortName].locked) {
        this.incidentFields[shortName].enabled = this.incidentFieldsSelectAllState;
      }
    });
  }



  onToggleAllCustomFields() {
    // console.log('IncidentFieldsUIComponent: onToggleAllCustomFields()')
    Object.keys(this.customFields).forEach( shortName => {
      if (!this.customFields[shortName].locked) {
        this.customFields[shortName].enabled = this.customFieldsSelectAllState;
      }
    });
  }



  onResetAllFieldValues() {
    this.fieldDisplayComponents.forEach( component => component.onResetValue(false) );
  }



  onResetAllCustomFieldValues() {
    this.customFieldDisplayComponents.forEach( component => component.onResetValue(true) );
  }



  async onReloadFieldDefinitions(serverId = this.currentDemistoEndpointName) {
    /*
    Reload Demisto Incident Fields and Merge

    Called from onCreateBulkIncidents() and "Reload Definitions" button
    */
    console.log('IncidentFieldsUIComponent: onReloadFieldDefinitions()');
    try {
      let success = await this.parentComponent.fetchIncidentFieldDefinitions(serverId);
      if (!success) {
        console.log('IncidentFieldsUIComponent: onReloadFieldDefinitions(): incident fields fetch was unsuccessful.  Aborting.');
        return;
      }

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
    catch (err) {
      console.log('IncidentFieldsUIComponent: onReloadFieldDefinitions(): Caught error fetching Demisto incident fields:', err);
    }
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
      this.messagesChange.emit( [{ severity: 'error', summary: 'Failure', detail: resultMessage}] );
    }
    else {
      const resultMessage = `Demisto incident created with id ${res.id}`;
      this.messagesChange.emit( [{ severity: 'success', summary: 'Success', detail: resultMessage}] );
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
    this.incidentFieldsChange.emit(this.incidentFields);
  }



  onCustomFieldChanged(key, value) {
    // console.log('IncidentFieldsUIComponent: onCustomFieldChanged: key:', key);
    // console.log('IncidentFieldsUIComponent: onCustomFieldChanged: value:', value);
    this.customFields[key] = value;
    this.customFieldsChange.emit(this.customFields);
  }

}
