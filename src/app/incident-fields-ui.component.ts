import { Component, OnInit, ViewChildren, ChangeDetectorRef, Input, Inject, forwardRef, Output, EventEmitter } from '@angular/core';
import { FetcherService } from './fetcher-service';
import { DemistoAPI, DemistoAPIEndpoints } from './types/demisto-properties';
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

export class IncidentFieldsUIComponent implements OnInit {

  constructor(
      private fetcherService: FetcherService, // import our URL fetcher
      private confirmationService: ConfirmationService,
      private changeDetector: ChangeDetectorRef,
      @Inject(forwardRef(() => AppComponent )) private parentComponent: AppComponent
  ) {}

  @ViewChildren(FieldDisplayComponent) fieldDisplayComponents: FieldDisplayComponent[];

  @Input() parsedIncidentJson: any; // parsed json
  @Input() loadedConfigName: string; // must clear when loaded from json or when current config is deleted
  @Input() currentDemistoApiName: string;
  @Input() currentServerApiInit: boolean;
  @Input() fetchedIncidentFieldDefinitions: FetchedIncidentFieldDefinitions; // the fields taken from Demisto

  @Input() incidentFields: IncidentFields;
  @Output() incidentFieldsChange: EventEmitter<IncidentFields> = new EventEmitter();
  // tslint:disable-next-line:variable-name
  _incidentFields: IncidentFields;

  @Input() customFields: IncidentFields; // the custom fields of our imported or loaded json
  @Output() customFieldsChange: EventEmitter<IncidentFields> = new EventEmitter();
  // tslint:disable-next-line:variable-name
  _customFields: IncidentFields;

  @Input() createInvestigation: boolean; // sets createInvestigation: true in json when submitting an incident
  @Output() createInvestigationChange: EventEmitter<boolean> = new EventEmitter();

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



  ngOnInit() {
    this._incidentFields = this.incidentFields;
    this._customFields = this.customFields;
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



  onResetAllFieldValues() {
    this.fieldDisplayComponents.forEach( component => component.onResetValue(false) );
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



  onResetAllCustomFieldValues() {
    this.fieldDisplayComponents.forEach( component => component.onResetValue(true) );
  }



  async onReloadFieldDefinitions(serverId = this.currentDemistoApiName) {
    /*
    Reload Demisto Incident Fields and Merge

    Called from onCreateBulkIncidents() and "Reload Definitions" button
    */
    console.log('onReloadFieldDefinitions()');
    try {
      let success = await this.parentComponent.fetchIncidentFieldDefinitions(serverId);
      if (!success) {
        console.log('onReloadFieldDefinitions(): incident fields fetch was unsuccessful.  Aborting.');
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
      console.log('onReloadFieldDefinitions(): Caught error fetching Demisto incident fields:', err);
    }
  }



  async onCreateIncident() {
    // console.log('onCreateIncident(): incidentFields:', this.incidentFields);
    // console.log('onCreateIncident(): customFields:', this.customFields);

    let incident: any = {
      serverId: this.currentDemistoApiName
    };
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
    // console.log('onIncidentFieldChanged: key:', key);
    // console.log('onIncidentFieldChanged: value:', value);
    this._incidentFields[key] = value;
    this.incidentFieldsChange.emit(this._incidentFields);
  }



  onCustomFieldChanged(key, value) {
    // console.log('onCustomFieldChanged: key:', key);
    // console.log('onCustomFieldChanged: value:', value);
    this._customFields[key] = value;
    this.customFieldsChange.emit(this._customFields);
  }

}
