import { Component, OnInit, Input, ChangeDetectorRef, ViewChildren, ViewChild } from '@angular/core';
import { FetcherService } from './fetcher-service';
import { DemistoEndpoint, DemistoEndpoints } from './types/demisto-endpoints';
import { SelectItem, ConfirmationService } from 'primeng/api';
import { Listbox } from 'primeng/listbox';
import { FetchedIncidentField, FetchedIncidentFieldDefinitions } from './types/fetched-incident-field';
import { FieldType, IncidentField, IncidentFields } from './types/incident-fields';
import { FetchedIncidentType } from './types/fetched-incident-types';
import { FieldDisplayFreeformComponent } from './field-display-freeform.component';

@Component({
  // tslint:disable-next-line: component-selector
  selector: 'json-mapping-ui',
  templateUrl: './json-mapping-ui.component.html'
})

export class JsonMappingUIComponent implements OnInit {

  constructor(
    private fetcherService: FetcherService, // import our URL fetcher
    private confirmationService: ConfirmationService,
    private changeDetector: ChangeDetectorRef
  ) {}

  @ViewChildren('incidentField') fieldDisplayComponents: FieldDisplayFreeformComponent[];
  @ViewChildren('customField') customFieldDisplayComponents: FieldDisplayFreeformComponent[];
  @ViewChild('customFieldListBox') customFieldListBoxComponent: Listbox;

  @Input() loadedJsonMappingConfigName: string; // must clear when loaded from json or when current config is deleted
  @Input() currentDemistoEndpointName: string;
  @Input() currentDemistoEndpointInit: boolean;
  @Input() fetchedIncidentFieldDefinitions: FetchedIncidentFieldDefinitions; // the fields taken from Demisto
  @Input() fetchedIncidentTypes: FetchedIncidentType[]; // the incident types taken from Demisto

  availableIncidentFields: IncidentFields; // our incident fields
  availableCustomFields: IncidentFields; // our custom fields
  chosenIncidentFields: IncidentFields; // incident fields that have been added to the config
  chosenCustomFields: IncidentFields; // custom fields that have been added to the config
  get chosenCustomFieldsLen(): number {
    return this.chosenCustomFields ? Object.keys(this.chosenCustomFields).length : 0;
  }
  defaultIncidentFieldsToAdd = [
    'details',
    'name',
    'owner',
    'severity',
    'type',
  ]
  internalFieldShortNamesToInclude = ['attachment', 'feedbased', 'labels'];
  parsedJson: Object;
  get selectedFieldsToAddLen(): number {
    return this.selectedFieldsToAdd.length;
  }
  selectedCustomFieldsToAdd: string[];
  get selectedCustomFieldsToAddLen(): number {
    return this.selectedCustomFieldsToAdd.length;
  }
  
  // PrimeNG Selected Values
  selectedIncidentType: string;
  displayAddIncidentFieldDialog = false;
  displayAddCustomFieldDialog = false;
  selectedFieldsToAdd: string[];
  createInvestigation = true;

  // PrimeNG Items
  incidentTypeItems: SelectItem[];
  chosenTypeItems: SelectItem[];
  incidentFieldsToAddItems: SelectItem[];
  customFieldsToAddItems: SelectItem[];
  createInvestigationButtonItems: SelectItem[] = [
    { value: true, label: 'Enabled' },
    { value: false, label: 'Disabled' }
  ];

  // UI State
  displayIncidentFieldShortNames = true; // controls display options
  displayCustomFieldShortNames = true; // controls display options
  incidentFieldsSelectAllState = false;
  customFieldsSelectAllState = false;
  freeformJsonSelector = false;

  // UI Labels
  longNamesLabel = 'Short Names';
  shortNamesLabel = 'Long Names';


  ngOnInit() {
    console.log('JsonMappingUIComponent: ngOnInit(): fetchedIncidentFieldDefinitions:', this.fetchedIncidentFieldDefinitions);

    if (this.fetchedIncidentTypes && this.fetchedIncidentFieldDefinitions) {
      this.buildIncidentTypeItems();
    }
  }



  buildIncidentTypeItems() {
    console.log('JsonMappingUIComponent: buildIncidentTypeItems()');
    let items: SelectItem[] = [];
    for (let incidentType of this.fetchedIncidentTypes) {
      // console.log('JsonMappingUIComponent: buildIncidentTypeItems(): incidentType:', incidentType);
      const item: SelectItem = { label: incidentType.name, value: incidentType.name };
      items.push(item);
    }
    this.incidentTypeItems = items;
  }



  onIncidentTypeChanged(incidentType) {
    console.log('JsonMappingUIComponent: onIncidentTypeChanged(): incidentType:', incidentType);
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
    console.log('JsonMappingUIComponent: buildNewIncidentFieldOptions(): incidentType:', incidentType);
    
    let incidentFields: IncidentFields = {};
    let customFields: IncidentFields = {};
    let chosenIncidentFields: IncidentFields = {};
    // let chosenCustomFields: IncidentFields = {};

    for (let field of Object.values(this.fetchedIncidentFieldDefinitions)  ) {
      // console.log('JsonMappingUIComponent: buildNewIncidentFieldOptions(): field:', field);
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

      system ? incidentFields[shortName] = incidentField : customFields[shortName] = incidentField ;

      if (this.defaultIncidentFieldsToAdd.includes(shortName)) {
        // add default fields to added incident fields
        chosenIncidentFields[shortName] = incidentField;
      }
    }

    this.availableIncidentFields = incidentFields;
    this.availableCustomFields = customFields;
    this.chosenIncidentFields = chosenIncidentFields;

    console.log('JsonMappingUIComponent: buildNewIncidentFieldOptions(): availableIncidentFields:', this.availableIncidentFields);
    console.log('JsonMappingUIComponent: buildNewIncidentFieldOptions(): availableCustomFields:', this.availableCustomFields);
  }



  onToggleAllChosenIncidentFields() {
    // console.log('JsonMappingUIComponent: onToggleAllChosenIncidentFields()');
    Object.keys(this.chosenIncidentFields).forEach( shortName => {
      if (!this.chosenIncidentFields[shortName].locked) {
        this.chosenIncidentFields[shortName].enabled = this.incidentFieldsSelectAllState;
      }
    });
  }



  onToggleAllChosenCustomFields() {
    // console.log('JsonMappingUIComponent: onToggleAllChosenCustomFields()');
    Object.keys(this.chosenCustomFields).forEach( shortName => {
      if (!this.chosenCustomFields[shortName].locked) {
        this.chosenCustomFields[shortName].enabled = this.incidentFieldsSelectAllState;
      }
    });
  }



  onResetAllFieldValues() {
    this.fieldDisplayComponents.forEach( component => component.onResetValueClicked(false) );
  }



  onAddIncidentFieldClicked() {
    console.log('JsonMappingUIComponent: onAddIncidentFieldClicked()');
    this.incidentFieldsToAddItems = this.buildFieldsToAddItems(this.availableIncidentFields, this.chosenIncidentFields);
    this.displayAddIncidentFieldDialog = true;
  }



  onAddCustomFieldClicked() {
    console.log('JsonMappingUIComponent: onAddCustomFieldClicked()');
    this.customFieldsToAddItems = this.buildFieldsToAddItems(this.availableCustomFields, this.chosenCustomFields);
    this.displayAddCustomFieldDialog = true;
  }



  buildFieldsToAddItems(availableFields: IncidentFields, chosenFields: IncidentFields): SelectItem[] {
    // console.log('JsonMappingUIComponent: buildFieldsToAddItems()');
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
    // console.log('JsonMappingUIComponent: onAddIncidentFieldsAccept()');
    console.log('JsonMappingUIComponent: onAddIncidentFieldsAccept(): chosenIncidentFields:', this.chosenIncidentFields);
    for (const fieldName of this.selectedFieldsToAdd) {
      const field: IncidentField = this.availableIncidentFields[fieldName];
      this.chosenIncidentFields[field.shortName] = field;
    }
    // console.log('JsonMappingUIComponent: onAddIncidentFieldsAccept(): chosenIncidentFields:', this.chosenIncidentFields);
    this.selectedFieldsToAdd = [];
    this.displayAddIncidentFieldDialog = false;
  }



  onAddCustomFieldsAccept() {
    // console.log('JsonMappingUIComponent: onAddCustomFieldsAccept()');
    for (const fieldName of this.selectedCustomFieldsToAdd) {
      if (!this.chosenCustomFields) {
        this.chosenCustomFields = {};
      }
      const field: IncidentField = this.availableCustomFields[fieldName];
      this.chosenCustomFields[field.shortName] = field;
    }
    console.log('JsonMappingUIComponent: onAddCustomFieldsAccept(): chosenIncidentFields:', this.chosenCustomFields);
    this.selectedCustomFieldsToAdd = [];
    this.customFieldListBoxComponent._filterValue = '';
    this.displayAddCustomFieldDialog = false;
  }



  /*onChange() {
    console.log('onChange(): selectedCustomFieldsToAdd:', this.selectedCustomFieldsToAdd)
  }*/



  onDeleteAllIncidentFielsdClicked() {
    console.log(`JsonMappingUIComponent: onDeleteAllIncidentFielsdClicked()`);
    this.confirmationService.confirm({
      message: `Are you sure you want to delete all incident fields?`,
      accept: () => this.onAllIncidentFieldsRemoved(),
      icon: 'pi pi-exclamation-triangle'
    })
  }



  onDeleteAllCustomFielsdClicked() {
    console.log(`JsonMappingUIComponent: onDeleteAllCustomFielsdClicked()`);
    this.confirmationService.confirm({
      message: `Are you sure you want to delete all custom fields?`,
      accept: () => this.onAllCustomFieldsRemoved(),
      icon: 'pi pi-exclamation-triangle'
    })
  }



  onAllIncidentFieldsRemoved() {
    console.log('JsonMappingUIComponent: onAllIncidentFieldsRemoved()');
    for (const cliName of Object.keys(this.chosenIncidentFields)) {
      if (cliName !== 'type') {
        delete this.chosenIncidentFields[cliName];
      }
    }
  }



  onAllCustomFieldsRemoved() {
    console.log('JsonMappingUIComponent: onAllCustomFieldsRemoved()');
    for (const cliName of Object.keys(this.chosenCustomFields)) {
      if (cliName !== 'type') {
        delete this.chosenCustomFields[cliName];
      }
    }
  }



  onIncidentFieldRemoved(cliName: string) {
    console.log('JsonMappingUIComponent: onIncidentFieldRemoved(): cliName:', cliName);
    delete this.chosenIncidentFields[cliName];
  }



  onCustomIncidentFieldRemoved(cliName: string) {
    console.log('JsonMappingUIComponent: onCustomIncidentFieldRemoved(): cliName:', cliName);
    delete this.chosenCustomFields[cliName];
  }



  onFreeformJsonUploaded(data: { files: File }, uploadRef) {
    let file = data.files[0];
    console.log('JsonMappingUIComponent: onFreeformJsonUploaded(): file:', file);

    let reader = new FileReader();

    reader.onloadend = (progressEvent: ProgressEvent) => {
      try {
        this.parsedJson = JSON.parse(reader.result as string);
        console.log('JsonMappingUIComponent: onFreeformJsonUploaded(): parsedIncidentJson:', this.parsedJson);
        // this.buildIncidentFields(this.parsedJson);
        // this.loadedIncidentConfigName = undefined;
        // this.loadedIncidentConfigId = undefined;
        // this.createInvestigation = true;
      }
      catch (error) {
        console.error('JsonMappingUIComponent: onFreeformJsonUploaded(): onloadend((): Error parsing uploaded JSON:', error);
      }
      uploadRef.clear(); // allow future uploads
    };

    reader.readAsText(data.files[0]); // kick off the read operation (calls onloadend())
  }



  onShowBasicJsonViewerClicked() {
    console.log(`JsonMappingUIComponent: onShowBasicJsonViewerClicked()`);
    this.freeformJsonSelector = true;
  }


}
