import { Component, OnInit, Input, ChangeDetectorRef, ViewChildren, ViewChild, OnDestroy } from '@angular/core';
import { FetcherService } from './fetcher-service';
import { DemistoEndpoint, DemistoEndpoints } from './types/demisto-endpoints';
import { SelectItem, ConfirmationService } from 'primeng/api';
import { Listbox } from 'primeng/listbox';
import { FetchedIncidentField, FetchedIncidentFieldDefinitions } from './types/fetched-incident-field';
import { FieldType, IncidentField, IncidentFields } from './types/incident-fields';
import { FetchedIncidentType } from './types/fetched-incident-types';
import { FreeformJsonRowComponent } from './freeform-json-row.component';
import { Segment } from './ngx-json-viewer/ngx-json-viewer.component';
import { SampleIncident } from './sample-json';
import { Subject, Subscription } from 'rxjs';

@Component({
  // tslint:disable-next-line: component-selector
  selector: 'freeform-json-ui',
  templateUrl: './freeform-json-ui.component.html'
})

export class FreeformJsonUIComponent implements OnInit, OnDestroy {

  constructor(
    private fetcherService: FetcherService, // import our URL fetcher
    private confirmationService: ConfirmationService,
    private changeDetector: ChangeDetectorRef
  ) {}

  @ViewChildren('incidentField') freeformRowComponents: FreeformJsonRowComponent[];
  @ViewChild('incidentFieldListBox') incidentFieldListBoxComponent: Listbox;

  @Input() loadedJsonMappingConfigName: string; // must clear when loaded from json or when current config is deleted
  @Input() currentDemistoEndpointName: string;
  @Input() currentDemistoEndpointInit: boolean;
  @Input() fetchedIncidentFieldDefinitions: FetchedIncidentFieldDefinitions; // the fields taken from Demisto
  @Input() fetchedIncidentTypes: FetchedIncidentType[]; // the incident types taken from Demisto

  availableIncidentFields: IncidentFields; // our incident fields
  chosenIncidentFields: IncidentFields; // incident fields that have been added to the config
  defaultIncidentFieldsToAdd = [
    'details',
    'name',
    'owner',
    'severity',
    'type',
  ]
  internalFieldShortNamesToInclude = ['attachment', 'feedbased', 'labels'];
  json: Object;
  get selectedFieldsToAddLen(): number {
    return this.selectedFieldsToAdd.length;
  }
  
  // PrimeNG Selected Values
  selectedIncidentType: string;
  displayAddIncidentFieldDialog = false;
  selectedFieldsToAdd: string[];
  createInvestigation = true;

  // PrimeNG Items
  incidentTypeItems: SelectItem[];
  chosenTypeItems: SelectItem[];
  incidentFieldsToAddItems: SelectItem[];
  createInvestigationButtonItems: SelectItem[] = [
    { value: true, label: 'Enabled' },
    { value: false, label: 'Disabled' }
  ];

  // UI State
  displayIncidentFieldShortNames = true; // controls display options
  incidentFieldsSelectAllState = false;
  selectionMode = false;
  selectionModeFieldType: string;
  selectionModeFieldToMapTo: IncidentField;

  // UI Labels
  longNamesLabel = 'Short Names';
  shortNamesLabel = 'Long Names';

  private subscriptions = new Subscription();


  ngOnInit() {
    console.log('FreeformJsonUIComponent: ngOnInit(): fetchedIncidentFieldDefinitions:', this.fetchedIncidentFieldDefinitions);

    if (this.fetchedIncidentTypes && this.fetchedIncidentFieldDefinitions) {
      this.buildIncidentTypeItems();
    }

    this.json = SampleIncident; // comment out before committing

    // Subscriptions
    this.subscriptions.add( this.fetcherService.jsonSelectionReceivedSubject.subscribe( (segment: Segment) => this.onJsonSelectionReceived(segment) ));
    this.subscriptions.add( this.fetcherService.fieldMappingSelectionCanceled.subscribe( () => this.onFieldMappingSelectionCanceled() ));
  }



  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }



  buildIncidentTypeItems() {
    console.log('FreeformJsonUIComponent: buildIncidentTypeItems()');
    let items: SelectItem[] = [];
    for (let incidentType of this.fetchedIncidentTypes) {
      // console.log('FreeformJsonUIComponent: buildIncidentTypeItems(): incidentType:', incidentType);
      const item: SelectItem = { label: incidentType.name, value: incidentType.name };
      items.push(item);
    }
    this.incidentTypeItems = items;
  }



  onIncidentTypeChanged(incidentType) {
    console.log('FreeformJsonUIComponent: onIncidentTypeChanged(): incidentType:', incidentType);
    this.buildNewIncidentFieldOptions(incidentType);
  }



  returnDefaultValueByFieldType(fieldType: string, defaultRows: any = null): any {
    switch(fieldType) {
      case 'shortText':
        return '';
      case 'longText':
        return '';
      case 'singleSelect':
        return '';
      case 'multiSelect':
        return [];
      case 'grid':
        return defaultRows;
      case 'internal':
        return {};
      case 'number':
        return 0;
      case 'date':
        return new Date();
      case 'timer':
        // figure out what this
        break;
      case 'boolean':
        return true;
      case 'url':
        return '';
      case 'html':
        return '';
      case 'role':
        return '';
    }
  }



  buildNewIncidentFieldOptions(incidentType) {
    console.log('FreeformJsonUIComponent: buildNewIncidentFieldOptions(): incidentType:', incidentType);
    
    let incidentFields: IncidentFields = {};
    let chosenIncidentFields: IncidentFields = {};

    for (let field of Object.values(this.fetchedIncidentFieldDefinitions)  ) {
      // console.log('FreeformJsonUIComponent: buildNewIncidentFieldOptions(): field:', field);
      const associatedToAll = field.associatedToAll;
      const shortName = field.cliName;
      const system = field.system;
      const type = field.type;
      const defaultRows = type === 'grid' && field.defaultRows ? field.defaultRows : null;
      const defaultValue = this.returnDefaultValueByFieldType(type, defaultRows);

      if (type === 'timer') continue;

      if (type === 'internal' && ! this.internalFieldShortNamesToInclude.includes(shortName) ) continue;

      if (!associatedToAll && ( !field.associatedTypes || !field.associatedTypes.includes(incidentType) ) ) {
        // skip fields which aren't associated with this incident type
        continue;
      }

      let incidentField: IncidentField = {
        shortName,
        longName: field.name,
        enabled: false,
        locked: false,
        value: defaultValue,
        originalValue: defaultValue,
        fieldType: type,
        custom: !system
      }

      if (shortName === 'type') {
        // pre-populate 'type' field
        incidentField.value = incidentType;
        incidentField.originalValue = incidentType;
        incidentField.enabled = true;
      }

      if (['singleSelect', 'multiSelect'].includes(type) && field.selectValues && field.selectValues.length !== 0) {
        incidentField.selectValues = (field.selectValues as string[]).slice(1);
      }

      incidentFields[shortName] = incidentField;

      if (this.defaultIncidentFieldsToAdd.includes(shortName)) {
        // add default fields to added incident fields
        chosenIncidentFields[shortName] = incidentField;
      }
    }

    this.availableIncidentFields = incidentFields;
    // this.availableCustomFields = customFields;
    this.chosenIncidentFields = chosenIncidentFields;

    console.log('FreeformJsonUIComponent: buildNewIncidentFieldOptions(): availableIncidentFields:', this.availableIncidentFields);
    // console.log('FreeformJsonUIComponent: buildNewIncidentFieldOptions(): availableCustomFields:', this.availableCustomFields);
  }



  onToggleAllChosenIncidentFields() {
    // console.log('FreeformJsonUIComponent: onToggleAllChosenIncidentFields()');
    Object.keys(this.chosenIncidentFields).forEach( shortName => {
      if (!this.chosenIncidentFields[shortName].locked) {
        this.chosenIncidentFields[shortName].enabled = this.incidentFieldsSelectAllState;
      }
    });
  }



  onResetAllFieldValues() {
    this.freeformRowComponents.forEach( component => component.onResetValueClicked(false) );
  }



  onAddIncidentFieldClicked() {
    console.log('FreeformJsonUIComponent: onAddIncidentFieldClicked()');
    this.incidentFieldsToAddItems = this.buildFieldsToAddItems(this.availableIncidentFields, this.chosenIncidentFields);
    this.displayAddIncidentFieldDialog = true;
    // focus input element
    setTimeout( () => {
      (document.getElementsByClassName('addIncidentFieldListbox')[0].getElementsByClassName('ui-inputtext')[0] as HTMLInputElement).focus();
    }, 200 );
  }



  buildFieldsToAddItems(availableFields: IncidentFields, chosenFields: IncidentFields): SelectItem[] {
    // console.log('FreeformJsonUIComponent: buildFieldsToAddItems()');
    let fieldsAvailableToAddItems: SelectItem[] = [];
    if (!chosenFields || Object.keys(chosenFields).length === 0) {
      for (const field of Object.values(availableFields)) {
        fieldsAvailableToAddItems.push({
          label: `${field.longName} <${field.fieldType}>`,
          value: field.shortName
        });
      }
    }
    else {
      const chosenFieldKeys = Object.keys(chosenFields);
      for (const field of Object.values(availableFields)) {
        if (!chosenFieldKeys.includes(field.shortName)) {
          fieldsAvailableToAddItems.push({
            label: `${field.longName} <${field.fieldType}>`,
            value: field.shortName
          });
        }
      }
    }
    return fieldsAvailableToAddItems;
  }



  onAddIncidentFieldsAccept() {
    // console.log('FreeformJsonUIComponent: onAddIncidentFieldsAccept()');
    console.log('FreeformJsonUIComponent: onAddIncidentFieldsAccept(): chosenIncidentFields:', this.chosenIncidentFields);
    for (const fieldName of this.selectedFieldsToAdd) {
      const field: IncidentField = this.availableIncidentFields[fieldName];
      this.chosenIncidentFields[field.shortName] = field;
    }
    // console.log('FreeformJsonUIComponent: onAddIncidentFieldsAccept(): chosenIncidentFields:', this.chosenIncidentFields);
    this.selectedFieldsToAdd = [];
    this.incidentFieldListBoxComponent._filterValue = '';
    this.displayAddIncidentFieldDialog = false;
  }



  /*onChange() {
    console.log('onChange(): selectedCustomFieldsToAdd:', this.selectedCustomFieldsToAdd)
  }*/



  onDeleteAllIncidentFielsdClicked() {
    console.log(`FreeformJsonUIComponent: onDeleteAllIncidentFielsdClicked()`);
    this.confirmationService.confirm({
      message: `Are you sure you want to delete all incident fields?`,
      accept: () => this.onAllIncidentFieldsRemoved(),
      icon: 'pi pi-exclamation-triangle'
    })
  }



  onAllIncidentFieldsRemoved() {
    console.log('FreeformJsonUIComponent: onAllIncidentFieldsRemoved()');
    for (const cliName of Object.keys(this.chosenIncidentFields)) {
      if (cliName !== 'type') {
        delete this.chosenIncidentFields[cliName];
      }
    }
  }



  onIncidentFieldRemoved(cliName: string) {
    console.log('FreeformJsonUIComponent: onIncidentFieldRemoved(): cliName:', cliName);
    delete this.chosenIncidentFields[cliName];
  }



  onFreeformJsonUploaded(data: { files: File }, uploadRef) {
    let file = data.files[0];
    console.log('FreeformJsonUIComponent: onFreeformJsonUploaded(): file:', file);

    let reader = new FileReader();

    reader.onloadend = (progressEvent: ProgressEvent) => {
      try {
        this.json = JSON.parse(reader.result as string);
        console.log('FreeformJsonUIComponent: onFreeformJsonUploaded(): json:', this.json);
      }
      catch (error) {
        console.error('FreeformJsonUIComponent: onFreeformJsonUploaded(): onloadend((): Error parsing uploaded JSON:', error);
      }
      uploadRef.clear(); // allow future uploads
    };

    reader.readAsText(data.files[0]); // kick off the read operation (calls onloadend())
  }



  onStaticSelectValueFromJsonClicked(field: IncidentField) {
    console.log(`FreeformJsonUIComponent: onStaticSelectValueFromJsonClicked(): field:`, field);
    this.selectionMode = true;
    this.selectionModeFieldType = field.fieldType;
    this.selectionModeFieldToMapTo = field;
  }



  onFieldMappingSelectionCanceled() {
    this.selectionMode = false;
    this.selectionModeFieldType = undefined;
    this.selectionModeFieldToMapTo = undefined;
  }



  onJsonSelectionReceived(segment: Segment) {
    console.log(`FreeformJsonUIComponent: onJsonSelectionReceived(): segment:`, segment);
    const fieldName = this.selectionModeFieldToMapTo.shortName;
    this.chosenIncidentFields[fieldName].value = segment.value;
    this.fetcherService.fieldMappingSelectionCanceled.next();
  }


}
