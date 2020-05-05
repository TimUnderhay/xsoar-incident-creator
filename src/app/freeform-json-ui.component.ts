import { Component, OnInit, Input, Output, EventEmitter, ChangeDetectorRef, ViewChildren, ViewChild, OnDestroy } from '@angular/core';
import { FetcherService, FieldMappingSelection } from './fetcher-service';
import { DemistoEndpoint, DemistoEndpoints } from './types/demisto-endpoints';
import { SelectItem, ConfirmationService } from 'primeng/api';
import { PMessageOption } from './types/message-options';
import { Listbox } from 'primeng/listbox';
import { FetchedIncidentField, FetchedIncidentFieldDefinitions } from './types/fetched-incident-field';
import { FieldType, IncidentField, IncidentFields } from './types/incident-fields';
import { FetchedIncidentType } from './types/fetched-incident-types';
import { FreeformJsonRowComponent } from './freeform-json-row.component';
import { Segment } from './ngx-json-viewer/ngx-json-viewer.component';
import { SampleIncident } from './sample-json';
import { Subject, Subscription } from 'rxjs';
import { MappingMethod } from './freeform-json-row.component';
import * as utils from './utils';
declare var jmespath: any;

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

  @ViewChildren('incidentFieldRow') freeformRowComponents: FreeformJsonRowComponent[];
  @ViewChild('incidentFieldListBox') incidentFieldListBoxComponent: Listbox;

  @Input() loadedJsonMappingConfigName: string; // must clear when loaded from json or when current config is deleted
  @Input() currentDemistoEndpointName: string;
  @Input() currentDemistoEndpointInit: boolean;
  @Input() fetchedIncidentFieldDefinitions: FetchedIncidentFieldDefinitions; // the fields taken from Demisto
  @Input() fetchedIncidentTypes: FetchedIncidentType[]; // the incident types taken from Demisto

  // PrimeNG Messages Popup Inputs / Outputs
  @Output() messagesReplace = new EventEmitter<PMessageOption[]>();
  @Output() messageWithAutoClear = new EventEmitter<PMessageOption>();

  availableIncidentFields: IncidentFields; // our incident fields
  chosenIncidentFields: IncidentField[]; // incident fields that have been added to the config
  defaultIncidentFieldsToAdd = [
    'details',
    'name',
    'owner',
    'severity',
    'type',
  ]
  whitelistedInternalFieldNames = ['attachment', 'feedbased', 'labels'];
  json: Object;
  get selectedFieldsToAddLen(): number {
    return this.selectedFieldsToAdd.length;
  }

  // Blacklisted field types
  blacklistedFieldTypes = ['timer'];
  
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

  // UI Labels
  longNamesLabel = 'Short Names';
  shortNamesLabel = 'Long Names';

  private subscriptions = new Subscription();

  enabledFieldsCount = 0;


  ngOnInit() {
    console.log('FreeformJsonUIComponent: ngOnInit(): fetchedIncidentFieldDefinitions:', this.fetchedIncidentFieldDefinitions);

    if (this.fetchedIncidentTypes && this.fetchedIncidentFieldDefinitions) {
      this.buildIncidentTypeItems();
    }

    setTimeout( () => this.json = SampleIncident ); // comment out before committing to dev/master

    // Take Subscriptions
    this.subscriptions.add( this.fetcherService.fieldMappingSelectionActive.subscribe( (fieldMappingSelection: FieldMappingSelection) => this.onFieldMappingSelectionActive(fieldMappingSelection) ));
    
    this.subscriptions.add( this.fetcherService.fieldMappingSelectionEnded.subscribe( () => this.onFieldMappingSelectionEnded() ));

    this.subscriptions.add( this.fetcherService.fieldMappingSelectionReceived.subscribe( () => this.onFieldMappingSelectionEnded() ));
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
    let chosenIncidentFields: IncidentField[] = [];

    for (let field of Object.values(this.fetchedIncidentFieldDefinitions)  ) {
      // console.log('FreeformJsonUIComponent: buildNewIncidentFieldOptions(): field:', field);
      const associatedToAll = field.associatedToAll;
      const shortName = field.cliName;
      const system = field.system;
      const type = field.type;
      const defaultRows = type === 'grid' && field.defaultRows ? field.defaultRows : null;
      const defaultValue = this.returnDefaultValueByFieldType(type, defaultRows);
      const isReadOnly = field.isReadOnly;

      if (isReadOnly) {
        console.warn(`Excluding read-only field '${shortName}'`);
        continue;
      };

      for (const fieldType of this.blacklistedFieldTypes) {
        // skip blacklisted field types
        if (fieldType === type) {
          console.warn(`Excluding field '${shortName}' of blacklisted type '${fieldType}'`)
          continue;
        }
      }

      if (type === 'internal' && ! this.whitelistedInternalFieldNames.includes(shortName) ) continue;

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
        custom: !system,
        mappingMethod: 'static',
        jmesPath: '',
        permitNullValue: false
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
        chosenIncidentFields.push(incidentField);
      }
    }

    this.availableIncidentFields = incidentFields;
    // this.availableCustomFields = customFields;
    this.chosenIncidentFields = chosenIncidentFields;

    this.countEnabledFields();

    console.log('FreeformJsonUIComponent: buildNewIncidentFieldOptions(): availableIncidentFields:', this.availableIncidentFields);
    // console.log('FreeformJsonUIComponent: buildNewIncidentFieldOptions(): availableCustomFields:', this.availableCustomFields);
  }



  onToggleAllChosenIncidentFields() {
    // console.log('FreeformJsonUIComponent: onToggleAllChosenIncidentFields()');
    /*Object.keys(this.chosenIncidentFields).forEach( shortName => {
      if (!this.chosenIncidentFields[shortName].locked) {
        this.chosenIncidentFields[shortName].enabled = this.incidentFieldsSelectAllState;
      }
    });*/
    for (let field of this.chosenIncidentFields) {
      if (!field.locked) {
        field.enabled = this.incidentFieldsSelectAllState;
      }
    }
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



  buildFieldsToAddItems(availableFields: IncidentFields, chosenFields: IncidentField[]): SelectItem[] {
    // console.log('FreeformJsonUIComponent: buildFieldsToAddItems()');
    let fieldsAvailableToAddItems: SelectItem[] = [];
    /*if (!chosenFields || Object.keys(chosenFields).length === 0) {
      for (const field of Object.values(availableFields)) {
        fieldsAvailableToAddItems.push({
          label: `${field.longName} <${field.fieldType}>`,
          value: field.shortName
        });
      }
    }*/
    if (!chosenFields || chosenFields.length === 0) {
      for (const field of Object.values(availableFields)) {
        fieldsAvailableToAddItems.push({
          label: `${field.longName} <${field.fieldType}>`,
          value: field.shortName
        });
      }
    }
    else {
      const chosenFieldKeys = chosenFields.map( field => field.shortName );
      for (const field of Object.values(availableFields)) {
        if (!chosenFieldKeys.includes(field.shortName)) {
          fieldsAvailableToAddItems.push({
            label: `${field.longName} <${field.fieldType}>`,
            value: field.shortName
          });
        }
      }
    }
    /*else {
      const chosenFieldKeys = Object.keys(chosenFields);
      for (const field of Object.values(availableFields)) {
        if (!chosenFieldKeys.includes(field.shortName)) {
          fieldsAvailableToAddItems.push({
            label: `${field.longName} <${field.fieldType}>`,
            value: field.shortName
          });
        }
      }
    }*/
    return fieldsAvailableToAddItems;
  }



  getFieldFromChosenFields(shortName: string): IncidentField {
    for (let field of this.chosenIncidentFields) {
      if (field.shortName === shortName) {
        return field;
      }
    }
    return undefined;
  }



  chosenFieldsSortCompare(a: IncidentField, b: IncidentField) {
    return a.shortName > b.shortName ? 1 : -1;
  }



  setFieldOfChosenFields(newField: IncidentField, assign = true) {
    const shortName = newField.shortName;
    for (let i = 0; i < this.chosenIncidentFields.length; i++) {
      let field = this.chosenIncidentFields[i];
      if (field.shortName === shortName) {
        this.chosenIncidentFields[i] = assign ? Object.assign({}, newField) : newField;
        this.countEnabledFields();
        return;
      }
    }
    this.chosenIncidentFields.push(newField);
    this.chosenIncidentFields.sort(this.chosenFieldsSortCompare);
    this.countEnabledFields();
  }



  deleteChosenField(shortName) {
    for (let i = 0; i < this.chosenIncidentFields.length; i++) {
      let field = this.chosenIncidentFields[i];
      if (field.shortName === shortName) {
        this.chosenIncidentFields.splice(i, 1);
        return;
      }
    }
  }



  onAddIncidentFieldsAccept() {
    // console.log('FreeformJsonUIComponent: onAddIncidentFieldsAccept()');
    console.log('FreeformJsonUIComponent: onAddIncidentFieldsAccept(): chosenIncidentFields:', this.chosenIncidentFields);
    for (const fieldName of this.selectedFieldsToAdd) {
      const field: IncidentField = this.availableIncidentFields[fieldName];
      // this.chosenIncidentFields[field.shortName] = field;
      this.setFieldOfChosenFields(this.availableIncidentFields[fieldName])
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
    let typeField = this.getFieldFromChosenFields('type');
    this.chosenIncidentFields = [typeField];

    /*for (const cliName of Object.keys(this.chosenIncidentFields)) {
      if (cliName !== 'type') {
        delete this.chosenIncidentFields[cliName];
      }
    }*/
  }



  onIncidentFieldRemoved(cliName: string) {
    console.log('FreeformJsonUIComponent: onIncidentFieldRemoved(): cliName:', cliName);
    // delete this.chosenIncidentFields[cliName];
    this.deleteChosenField(cliName);
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



  onFieldMappingSelectionActive(fieldMappingSelection: FieldMappingSelection) {
    const field = fieldMappingSelection.field;
    console.log(`FreeformJsonUIComponent: onFieldMappingSelectionActive(): field:`, field);
    this.selectionMode = true;
    this.selectionModeFieldType = field.fieldType;
  }



  onFieldMappingSelectionEnded() {
    this.selectionMode = false;
    this.selectionModeFieldType = undefined;
  }



  trackByIdentity(index, field: IncidentField)  {
    return field;
  }



  async onCreateIncident() {
    // console.log('FreeformJsonUIComponent: onCreateIncident(): incidentFields:', this.incidentFields);
    // console.log('FreeformJsonUIComponent: onCreateIncident(): customFields:', this.customFields);

    let incident: any = {
      serverId: this.currentDemistoEndpointName
    };

    if (this.createInvestigation) {
      incident['createInvestigation'] = true;
    }

    function updateIncident(field, value, incident) {
      // value is not taken from field as it may be resolved from JMESPath
      if (field.custom) {
        if (!('CustomFields' in incident)) {
          incident['CustomFields'] = {}
        }
        incident['CustomFields'][field.shortName] = value;
      }
      else {
        incident[field.shortName] = value;
      }
      return incident;
    }

    for (const freeformRowComponent of this.freeformRowComponents) {
      const field = freeformRowComponent.field;

      if (!field.enabled) {
        continue;
      }

      if (field.mappingMethod === 'static') {
        // incident[field.shortName] = field.value;
        incident = updateIncident(field, field.value, incident);
      }

      else if (field.mappingMethod === 'jmespath') {
        let value = this.jmesPathResolve(field.jmesPath);
        value = this.massageData(value, field.fieldType);
        if (value === null && !field.permitNullValue) {
          continue;
        }
        // incident[field.shortName] = value;
        incident = updateIncident(field, value, incident);
      }

    }

    console.log('FreeformJsonUIComponent: onCreateIncident(): incident:', incident);

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



  massageData(value, fieldType) {
    switch(fieldType) {
      case 'number':
        return utils.toNumber(value);
      case 'shortText':
        return utils.toString(value);
      case 'longText':
        return utils.toString(value);
      case 'boolean':
        return utils.toBoolean(value);
      case 'grid':
        return utils.toGrid(value);
      case 'url':
        return utils.toString(value);
      case 'html':
        return utils.toString(value);
      case 'markdown':
        return utils.toString(value);
      case 'role':
        return utils.toStringArray(value);
      case 'user':
        return utils.toString(value);
      case 'singleSelect':
        return utils.toString(value);
      case 'multiSelect':
        return utils.toStringArray(value);
      case 'internal':
        // FINISH ME!!!
        return value;
      case 'date':
        // FINISH ME!!!
        return value;
      case 'timer':
        // FINISH ME!!!
        return value;
      case 'attachments':
        // FINISH ME!!!
        return value;
      case 'tagsSelect':
        // FINISH ME!!!
        return value;
    }
  }



  jmesPathResolve(path) {
    console.log('FreeformJsonUIComponent: jmesPathResolve()');
    // this.field.jmesPath = path;
    // setTimeout( () => this.fieldChange.emit(this.field) );
    if (path === '' || path.match(/^\s+$/)) {
      return null;
    }
    try {
      const res = jmespath.search(this.json, path);
      // this.jmesPathResolveError = undefined;
      // console.log('res:', res);
      return res;
    }
    catch(error) {
      console.error(error);
      // this.jmesPathResolveError = error;
    }
  }



  countEnabledFields() {
    let enabledFieldsCount = 0;
    for (const field of this.chosenIncidentFields) {
      enabledFieldsCount = field.enabled ? enabledFieldsCount + 1 : enabledFieldsCount;
    }
    this.enabledFieldsCount = enabledFieldsCount;
  }



  onFieldChange(field: IncidentField) {
    // console.log('FreeformJsonUIComponent: onFieldChange():', field.shortName);
    this.setFieldOfChosenFields(field, false);
  }

}
