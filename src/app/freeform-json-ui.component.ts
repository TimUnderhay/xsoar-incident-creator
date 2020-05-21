import { Component, OnInit, Input, Output, EventEmitter, ChangeDetectorRef, ViewChildren, ViewChild, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { FetcherService, FieldMappingSelection } from './fetcher-service';
import { DemistoEndpoint, DemistoEndpoints } from './types/demisto-endpoints';
import { SelectItem, ConfirmationService } from 'primeng/api';
import { PMessageOption } from './types/message-options';
import { Listbox } from 'primeng/listbox';
import { FetchedIncidentField, FetchedIncidentFieldDefinitions } from './types/fetched-incident-field';
import { FieldType, IncidentField, IncidentFields, DateConfig } from './types/incident-fields';
import { FetchedIncidentType } from './types/fetched-incident-types';
import { FreeformJsonRowComponent } from './freeform-json-row.component';
import { Segment } from './ngx-json-viewer/ngx-json-viewer.component';
import { SampleIncident } from './sample-json';
import { Subscription } from 'rxjs';
import * as utils from './utils';
import { FreeformJSONConfig } from './types/freeform-json-config';
import { IncidentConfig, IncidentConfigs, IncidentFieldConfig, IncidentFieldsConfig } from './types/incident-config';
import { IncidentCreationConfig } from './types/incident-config';
import { InvestigationFields as investigationFields } from './investigation-fields';
import { DemistoIncidentImportResult } from './types/demisto-incident-import-result';
import dayjs from 'dayjs';
import utc from 'node_modules/dayjs/plugin/utc';
dayjs.extend(utc);
declare var jmespath: any;

@Component({
  // tslint:disable-next-line: component-selector
  selector: 'freeform-json-ui',
  templateUrl: './freeform-json-ui.component.html'
})

export class FreeformJsonUIComponent implements OnInit, OnChanges, OnDestroy {

  constructor(
    private fetcherService: FetcherService, // import our URL fetcher
    private confirmationService: ConfirmationService,
    private changeDetector: ChangeDetectorRef
  ) {}

  @ViewChildren('incidentFieldRow') freeformRowComponents: FreeformJsonRowComponent[];
  @ViewChild('incidentFieldListBox') incidentFieldListBoxComponent: Listbox;

  @Input() loadedIncidentConfigName: string; // must clear when loaded from json or when current config is deleted
  @Input() loadedIncidentConfigId: string;
  @Input() currentDemistoEndpointName: string;
  @Input() currentDemistoEndpointInit: boolean;
  @Input() fetchedIncidentFieldDefinitions: FetchedIncidentFieldDefinitions; // the fields taken from Demisto
  @Input() fetchedIncidentTypes: FetchedIncidentType[]; // the incident types taken from Demisto
  @Input() loadDefaultChosenFields: boolean;
  get fetchedIncidentTypeNames() {
    return this.fetchedIncidentTypes.map( incidentType => incidentType.name );
  }

  @Input() savedIncidentConfigurations: IncidentConfigs;
  @Input() demistoEndpointsItems: SelectItem[]; // holds list of endpoints for PrimeNG

  // PrimeNG Messages Popup Inputs / Outputs
  @Output() messagesReplace = new EventEmitter<PMessageOption[]>();
  @Output() messageWithAutoClear = new EventEmitter<PMessageOption>();
  @Output() messageAdd = new EventEmitter<PMessageOption>();

  @Output() savedIncidentConfigurationsChanged = new EventEmitter<string>();

  // NEW
  @Output() saveAsButtonEnabledChange = new EventEmitter<boolean>();
  @Output() saveButtonEnabledChange = new EventEmitter<boolean>();
  @Output() reloadFieldDefinitions = new EventEmitter<string>();

  availableIncidentFields: IncidentFields; // our incident fields
  chosenIncidentFields: IncidentField[] = []; // incident fields that have been added to the config
  incidentTypesToAssociatedFieldNames: object = {}; // incidentType: fieldnames
  defaultIncidentFieldsToAdd = [
    'details',
    'name',
    'owner',
    'severity',
    'type',
  ];
  whitelistedInternalFieldNames = ['attachment', 'feedbased', 'labels'];

  // JSON
  json: object;
  defaultJsonConfigName: string;
  loadedJsonConfigName: string;
  @Input() savedJsonConfigurations: string[];
  @Output() freeformJsonConfigurationsChanged = new EventEmitter<void>();

  get selectedFieldsToAddLen(): number {
    return this.selectedFieldsToAdd.length;
  }

  // Blacklisted field types
  blacklistedFieldTypes = ['timer', 'attachments'];

  // PrimeNG Selected Values
  _selectedIncidentType: string;
  set selectedIncidentType(value: string) {
    this._selectedIncidentType = value;
    this.setSelectedIncidentTypeIsAvailable();
  }
  get selectedIncidentType(): string {
    return this._selectedIncidentType;
  }
  selectedIncidentTypeAvailable = false;
  displayAddIncidentFieldDialog = false;
  selectedFieldsToAdd: string[];
  createInvestigation = true;
  selectedRawJsonCreationEndpoints: string[] = [];

  // PrimeNG Items
  incidentTypeItems: SelectItem[];
  chosenTypeItems: SelectItem[];
  incidentFieldsToAddItems: SelectItem[];
  createInvestigationButtonItems: SelectItem[] = [
    { value: true, label: 'Enabled' },
    { value: false, label: 'Disabled' }
  ];
  freeformJsonConfigurationItems: SelectItem[];

  // UI State
  displayIncidentFieldShortNames = true; // controls display options
  incidentFieldsSelectAllState = false;
  selectionMode = false;
  selectionModeFieldType: string;
  showJsonSaveAsDialog = false;
  showIncidentSaveAsDialog = false;
  saveAsConfigName = ''; // for text label
  get saveAsOkayButtonDisabled(): boolean {
    return this.savedJsonConfigurations.includes(this.saveAsConfigName);
  }
  showCreateIncidentFromJsonDialog = false;


  // UI Labels
  longNamesLabel = 'Short Names';
  shortNamesLabel = 'Long Names';

  enabledFieldsCount = 0;

  // Delete dialog
  showDeleteDialog = false;
  selectedDeleteConfigs: string[] = [];

  // JSON Open dialog
  showJsonOpenDialog = false;
  selectedJsonOpenConfig = '';

  // Save as dialog
  _saveAsButtonEnabled = false;
  set saveAsButtonEnabled(value) {
    this._saveAsButtonEnabled = value;
    this.saveAsButtonEnabledChange.emit(value);
  }

  private subscriptions = new Subscription();


  ngOnInit() {
    console.log('FreeformJsonUIComponent: ngOnInit(): fetchedIncidentFieldDefinitions:', this.fetchedIncidentFieldDefinitions);

    // setTimeout( () => this.json = SampleIncident ); // comment out before committing to dev/master

    // Take Subscriptions
    this.subscriptions.add( this.fetcherService.fieldMappingSelectionActive.subscribe( (fieldMappingSelection: FieldMappingSelection) => this.onFieldMappingSelectionActive(fieldMappingSelection) ));

    this.subscriptions.add( this.fetcherService.fieldMappingSelectionEnded.subscribe( () => this.onFieldMappingSelectionEnded() ));

    this.subscriptions.add( this.fetcherService.fieldMappingSelectionReceived.subscribe( () => this.onFieldMappingSelectionEnded() ));

    if (this.loadDefaultChosenFields) {
      this.buildIncidentFieldOptions(null, true);
    }
  }



  ngOnChanges(values: SimpleChanges) {
    // console.log('FreeformJsonUIComponent: ngOnChanges(): values:', values);

    if (utils.firstOrChangedSimpleChange('savedJsonConfigurations', values)) {
      this.freeformJsonConfigurationItems = this.savedJsonConfigurations.map( configName => ( { value: configName, label: configName } as SelectItem) ).sort();
    }

    if (utils.firstOrChangedSimpleChange('fetchedIncidentTypes', values)) {
      this.buildIncidentTypeItems();
    }

    if (utils.changedSimpleChange('fetchedIncidentFieldDefinitions', values)) {
      this.updateChosenFieldLocks(false);
    }
  }



  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }



  setSelectedIncidentTypeIsAvailable() {
    if (this.selectedIncidentType && !this.fetchedIncidentTypeNames.includes(this.selectedIncidentType)) {
      // the selected incident type is no longer defined in XSOAR
      this.selectedIncidentTypeAvailable = false;
    }
    else if (this.selectedIncidentType) {
      this.selectedIncidentTypeAvailable = true;
    }
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

    this.setSelectedIncidentTypeIsAvailable();
  }



  updateIncidentTypeField(incidentType) {
    for (const field of this.chosenIncidentFields) {
      if (field.shortName === 'type' && field.mappingMethod === 'static') {
        field.value = incidentType;
        field.enabled = true;
      }
    }
  }



  onIncidentTypeChanged(incidentType) {
    console.log('FreeformJsonUIComponent: onIncidentTypeChanged(): incidentType:', incidentType);
    const addDefaultChosenFields = this.chosenIncidentFields.length === 0 ? true : false;
    this.buildIncidentFieldOptions(incidentType, addDefaultChosenFields);
    this.updateChosenFieldLocks();
    this.updateIncidentTypeField(incidentType);
  }



  returnDefaultValueByFieldType(fieldType: string, defaultRows: any = null): any {
    switch (fieldType) {
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



  buildIncidentFieldOptions(incidentType, addDefaultChosenFields = false) {
    // called from onIncidentTypeChanged()
    // builds availableIncidentFields and optionally chosenIncidentFields
    // will blow away chosenIncidentFields if addDefaultChosenFields === true
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
      }

      for (const fieldType of this.blacklistedFieldTypes) {
        // skip blacklisted field types
        if (fieldType === type) {
          console.warn(`Excluding field '${shortName}' of blacklisted type '${fieldType}'`);
          continue;
        }
      }

      if (type === 'internal' && ! this.whitelistedInternalFieldNames.includes(shortName) )
      {
        continue;
      }

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
        permitNullValue: false,
        dateConfig: {}
      };

      if (shortName === 'type') {
        // pre-populate 'type' field
        incidentField.value = incidentType !== null ? incidentType : '';
        incidentField.originalValue = incidentType !== null ? incidentType : '';
        incidentField.enabled = incidentType !== null ? true : false;
      }

      if (['singleSelect', 'multiSelect'].includes(type) && field.selectValues && field.selectValues.length !== 0) {
        incidentField.selectValues = (field.selectValues as string[]).slice(1);
      }

      incidentFields[shortName] = incidentField;

      if (addDefaultChosenFields && this.defaultIncidentFieldsToAdd.includes(shortName)) {
        // add default fields to added incident fields
        chosenIncidentFields.push(incidentField);
      }
    }

    this.availableIncidentFields = incidentFields;
    if (addDefaultChosenFields) {
      this.chosenIncidentFields = chosenIncidentFields;
    }

    this.countEnabledFields();


    console.log('FreeformJsonUIComponent: buildNewIncidentFieldOptions(): availableIncidentFields:', this.availableIncidentFields);
  }



  onToggleAllChosenIncidentFields() {
    // console.log('FreeformJsonUIComponent: onToggleAllChosenIncidentFields()');
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
      this.setFieldOfChosenFields(this.availableIncidentFields[fieldName]);
    }
    // console.log('FreeformJsonUIComponent: onAddIncidentFieldsAccept(): chosenIncidentFields:', this.chosenIncidentFields);
    this.selectedFieldsToAdd = [];
    this.incidentFieldListBoxComponent._filterValue = '';
    this.displayAddIncidentFieldDialog = false;
  }



  onDeleteAllIncidentFielsdClicked() {
    console.log(`FreeformJsonUIComponent: onDeleteAllIncidentFielsdClicked()`);
    this.confirmationService.confirm({
      message: `Are you sure you want to delete all incident fields?`,
      accept: () => this.onAllIncidentFieldsRemoved(),
      icon: 'pi pi-exclamation-triangle'
    });
  }



  onAllIncidentFieldsRemoved() {
    console.log('FreeformJsonUIComponent: onAllIncidentFieldsRemoved()');
    let typeField = this.getFieldFromChosenFields('type');
    this.chosenIncidentFields = [typeField];
  }



  onIncidentFieldRemoved(cliName: string) {
    console.log('FreeformJsonUIComponent: onIncidentFieldRemoved(): cliName:', cliName);
    this.deleteChosenField(cliName);
  }



  onFreeformJsonUploaded(data: { files: File }, uploadRef) {
    let file = data.files[0];
    console.log('FreeformJsonUIComponent: onFreeformJsonUploaded(): file:', file);

    let reader = new FileReader();

    reader.onloadend = (progressEvent: ProgressEvent) => {
      try {
        this.json = JSON.parse(reader.result as string);
        this.loadedJsonConfigName = undefined;
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


    function updateIncident(field, value, inc) {
      // value is not taken from field as it may be resolved from JMESPath
      if (field.custom) {
        if (!('CustomFields' in incident)) {
          inc['CustomFields'] = {};
        }
        inc['CustomFields'][field.shortName] = value;
      }
      else {
        inc[field.shortName] = value;
      }
      return inc;
    }

    let incident: IncidentCreationConfig = {
      serverId: this.currentDemistoEndpointName,
      createInvestigation: this.createInvestigation
    };


    for (const freeformRowComponent of this.freeformRowComponents) {
      const field = freeformRowComponent.field;

      if (field.locked || !field.enabled) {
        continue;
      }

      if (field.mappingMethod === 'static') {
        incident = updateIncident(field, field.value, incident);
      }

      else if (field.mappingMethod === 'jmespath') {
        let value = this.jmesPathResolve(field.jmesPath);
        value = utils.massageData(value, field.fieldType);
        if (value === null && !field.permitNullValue) {
          continue;
        }
        if (field.fieldType === 'date' && value === null) {
          continue;
        }
        if (field.fieldType === 'date') {
          value = this.transformDate(value, field.dateConfig);
          if (value === null) {
            continue;
          }
        }

        incident = updateIncident(field, value, incident);
      }

    }

    console.log('FreeformJsonUIComponent: onCreateIncident(): incident:', incident);

    let res = await this.fetcherService.createDemistoIncident(incident);
    // console.log('FreeformJsonUIComponent: onCreateIncident(): res:', res);
    if (!res.success) {
      const resultMessage = `Incident creation failed with XSOAR status code ${res.statusCode}: "${res.statusMessage}"`;
      this.messagesReplace.emit( [{ severity: 'error', summary: 'Failure', detail: resultMessage}] );
    }
    else {
      const resultMessage = `XSOAR incident created with id ${res.id}`;
      this.messagesReplace.emit( [{ severity: 'success', summary: 'Success', detail: resultMessage}] );
    }

  }



  async onCreateIncidentFromJson() {
    // console.log('FreeformJsonUIComponent: onCreateIncidentFromJson()');

    this.messagesReplace.emit([]);

    for (const endpoint of this.selectedRawJsonCreationEndpoints) {
      const incident: any = {
        serverId: endpoint,
        json: this.json
      };

      console.log('FreeformJsonUIComponent: onCreateIncidentFromJson(): incident:', incident);

      let res = await this.fetcherService.createDemistoIncidentFromJson(incident);
      // console.log('FreeformJsonUIComponent: onCreateIncidentFromJson(): res:', res);

      if (!res.success) {
        const resultMessage = `Incident creation failed on '${endpoint}' with XSOAR status code ${res.statusCode}: "${res.statusMessage}"`;
        this.messageAdd.emit( { severity: 'error', summary: 'Failure', detail: resultMessage} );
      }
      else {
        const resultMessage = `XSOAR incident created from raw JSON with id ${res.id} on server '${endpoint}'`;
        this.messageAdd.emit( { severity: 'success', summary: 'Success', detail: resultMessage} );
      }

    }
    this.showCreateIncidentFromJsonDialog = false;
    this.selectedRawJsonCreationEndpoints = [];

  }



  jmesPathResolve(path) {
    console.log('FreeformJsonUIComponent: jmesPathResolve()');
    if (path === '' || path.match(/^\s+$/)) {
      return null;
    }
    try {
      const res = jmespath.search(this.json, path);
      // console.log('res:', res);
      return res;
    }
    catch (error) {
      console.log('JMESPath.search error:', 'message' in error ? error.message : error);
    }
  }



  transformDate(value: number | string, dateConfig: DateConfig): string {
    // console.log('FreeformJsonUIComponent: transformDate(): resolvedValue:', this.resolvedValue);

    if (!value || value === '') {
      return;
    }

    let valueType = typeof value;

    let moment: dayjs.Dayjs;

    if (valueType === 'number') {
      moment = dateConfig.precision === 1 ? dayjs.unix(value as number).utc() : dayjs(value as number / dateConfig.precision * 1000).utc();
    }

    else if (valueType === 'string') {
      moment = dateConfig.autoParse ? dayjs(value) : dayjs(value, dateConfig.formatter);
    }

    const valid = moment.isValid();

    if (valid && dateConfig.utcOffsetEnabled) {
      moment = moment.add(dateConfig.utcOffset, 'hour');
    }

    return moment.toISOString();
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



  onJsonSaveAsClicked() {
    console.log('FreeformJsonUIComponent: onJsonSaveAsClicked()');
    this.showJsonSaveAsDialog = true;
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      document.getElementsByClassName('jsonSaveAsDialog')[0].getElementsByTagName('input')[0].focus();
    }, 100);
  }



  async onJsonSaveAsAccepted() {
    console.log('FreeformJsonUIComponent: onJsonSaveAsAccepted()');

    try {
      const jsonConfig: FreeformJSONConfig = {
        name: this.saveAsConfigName,
        json: this.json
      };
      const res = await this.fetcherService.saveNewFreeformJSONConfiguration(jsonConfig);
      this.messageWithAutoClear.emit({severity: 'success', summary: 'Successful', detail: `JSON configuration '${this.saveAsConfigName}' has been saved`});
      this.loadedJsonConfigName = this.saveAsConfigName;
      this.saveAsConfigName = '';
    }
    catch (error) {
      console.error('FreeformJsonUIComponent: onJsonSaveAsAccepted(): caught error saving JSON config:', error);
      return;
    }

    // Update Fields Configurations
    this.freeformJsonConfigurationsChanged.emit();
    this.showJsonSaveAsDialog = false;
  }



  onJsonSaveAsCanceled() {
    console.log('FreeformJsonUIComponent: onJsonSaveAsCanceled()');
    this.showJsonSaveAsDialog = false;
    this.saveAsConfigName = '';
  }



  onJsonDeleteConfigClicked() {
    console.log('FreeformJsonUIComponent: onJsonDeleteConfigClicked()');
    this.showDeleteDialog = true;
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      (document.getElementsByClassName('deleteConfigDialog')[0].getElementsByClassName('ui-inputtext')[1] as HTMLInputElement).focus();
    }, 200);
  }



  onJsonDeleteConfigCanceled() {
    console.log('FreeformJsonUIComponent: onJsonDeleteConfigCanceled()');
    this.showDeleteDialog = false;
  }



  onJsonDeleteConfigAccepted() {
    console.log('FreeformJsonUIComponent: onJsonDeleteConfigAccepted()');
    this.showDeleteDialog = false;
    let message = `Are you sure that you would like to delete the configuration${utils.sPlural(this.selectedDeleteConfigs)}: ${this.selectedDeleteConfigs.join(', ')} ?`;
    if (this.selectedDeleteConfigs.includes(this.loadedJsonConfigName) ) {
      message = `Are you sure you want to delete the ACTIVE JSON configuration '${this.loadedJsonConfigName}' ?`;
    }
    this.confirmationService.confirm( {
      header: `Confirm Deletion`,
      message,
      accept: () => this.onJsonDeleteConfigConfirmed(),
      icon: 'pi pi-exclamation-triangle'
    });
  }



  async onJsonDeleteConfigConfirmed() {
    console.log('FreeformJsonUIComponent: onJsonDeleteConfigConfirmed()');

    this.selectedDeleteConfigs.forEach( async configName => {
      try {
        await this.fetcherService.deleteFreeformJSONConfiguration(configName);
        this.freeformJsonConfigurationsChanged.emit();
      }
      catch (error) {
        console.error(`FreeformJsonUIComponent: onJsonDeleteConfigConfirmed(): caught error whilst deleting JSON configuration ${configName}`);
        return;
      }
    });

    if (this.selectedDeleteConfigs.includes(this.loadedJsonConfigName)) {
      this.loadedJsonConfigName = undefined;
      this.defaultJsonConfigName = undefined;
    }

    this.messageWithAutoClear.emit({severity: 'success', summary: 'Successful', detail: `Configuration${utils.sPlural(this.selectedDeleteConfigs)} ${this.selectedDeleteConfigs.join(', ')} ${utils.werePlural(this.selectedDeleteConfigs)} successfully deleted`});

    this.selectedDeleteConfigs = []; // reset selection
  }



  onJsonOpenClicked() {
    console.log('FreeformJsonUIComponent: onJsonOpenClicked()');
    this.showJsonOpenDialog = true;
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      (document.getElementsByClassName('openJsonDialog')[0].getElementsByClassName('ui-inputtext')[1] as HTMLInputElement).focus();
    }, 200);
  }



  async getJsonConfig(configName) {
    // we want the calling function to use its own try/catch blocks, as error handling can differ depending on use case.
    this.json = await this.fetcherService.getSavedJSONConfiguration(configName);
    this.loadedJsonConfigName = configName;
  }



  async onJsonConfigOpened() {
    console.log('FreeformJsonUIComponent: onJsonConfigOpened()');
    this.showJsonOpenDialog = false;
    this.changeDetector.detectChanges();

    try {
      await this.getJsonConfig(this.selectedJsonOpenConfig);
      this.selectedJsonOpenConfig = ''; // reset selection
    }
     catch (error) {
      console.error('FreeformJsonUIComponent: onJsonConfigOpened(): error:', error);
      this.messagesReplace.emit([ {
        severity: 'error',
        detail: `Error loading JSON configuration ${this.selectedJsonOpenConfig}.  See console log for more info`,
        summary: 'Error'
      } ]);
    }
  }



  onJsonOpenCanceled() {
    console.log('FreeformJsonUIComponent: onJsonOpenCanceled()');
    this.showJsonOpenDialog = false;
  }



  /*async onSaveClicked() {
    console.log('FreeformJsonUIComponent(): onSaveClicked()');
    let config: FieldConfig = {
      name: this.loadedIncidentConfigName,
      incident: this.json,
      incidentFieldsConfig: this.buildFieldConfig(this.incidentFields),
      customFieldsConfig: this.buildFieldConfig(this.customFields),
      createInvestigation: this.createInvestigation,
      id: this.loadedIncidentConfigId
    };
    // console.log('FreeformJsonUIComponent: onSaveClicked(): config:', config);
    try {
      let res = await this.fetcherService.saveIncidentConfiguration(config);
    }
    catch (error) {
      console.error('FreeformJsonUIComponent: onSaveClicked(): caught error saving field config:', error);
      return;
    }
  }*/



  sortChosenFields(a: IncidentField, b: IncidentField): number {
    return utils.sortArrayNaturally(a.shortName, b.shortName);
  }



  buildChosenFieldsFromDemisto(json: any) {
    /*
    Called from onIncidentJsonUploaded(), getSampleIncident()
    No longer called from  onConfigOpened() -- that has a seperate method
    Builds incidentFields from passed incident JSON
    Assigns result to this.incidentFields
    */
    console.log('FreeformJsonUIComponent: buildChosenFieldsFromDemisto(): incidentJson:', json);
    // let incidentFields: IncidentFields = {};
    let chosenIncidentFields: IncidentField[] = [];
    let customFields: IncidentField[] = [];
    let skippedInvestigationFields = [];
    let skippedIncidentFields = [];

    Object.keys(json).forEach( shortName => {
      // console.log('FreeformJsonUIComponent: buildIncidentFields(): shortName:', shortName);
      let value = json[shortName];

      if (investigationFields.includes(shortName)) {
        skippedInvestigationFields.push(shortName);
        return;
      }

      if (shortName === 'CustomFields') {
        customFields = this.buildCustomFieldsFromDemisto(json.CustomFields);
        return;
      }

      const fetchedIncidentFieldDefinitionsFound = this.fetchedIncidentFieldDefinitions;

      if (!fetchedIncidentFieldDefinitionsFound) {
        // incidentFields[shortName] = {
        chosenIncidentFields.push( {
          shortName,
          value,
          originalValue: value,
          enabled: false,
          custom: false,
          locked: true,
          fieldType: 'undefined',
          lockedReason: 'No fields are currently available from XSOAR',
          mappingMethod: 'static',
          jmesPath: '',
          permitNullValue: false
        } );
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
          console.log(`Not adding field '${shortName}' of blacklisted type '${fieldType}'`);
          skippedIncidentFields.push(shortName);
          return;
        }
      }

      if (fetchedField.isReadOnly) {
        console.warn(`Not adding read-only incident field '${shortName}'`);
        skippedIncidentFields.push(shortName);
        return;
      }

      const newIncidentField: IncidentField  = {
        shortName,
        longName: fetchedField.name,
        enabled: shortName === 'type' ? true : false,
        locked: false,
        value,
        originalValue: value,
        fieldType: fetchedField.type,
        custom: false,
        mappingMethod: 'static',
        jmesPath: '',
        permitNullValue: false
      };

      chosenIncidentFields.push(newIncidentField);
    } );

    this.chosenIncidentFields = chosenIncidentFields.concat(customFields).sort(this.sortChosenFields);
    console.log(`Non-added investigation fields:`, skippedInvestigationFields);
    console.log(`Non-added incident fields:`, skippedIncidentFields);
    console.log('FreeformJsonUIComponent: buildIncidentFieldsFromDemisto(): chosenIncidentFields:', this.chosenIncidentFields);
  }



  // buildCustomFields(customFields) {
  buildCustomFieldsFromDemisto(customFields): IncidentField[] {
    /*
    Called from buildIncidentFields()
    */
    // console.log('FreeformJsonUIComponent: buildCustomFieldsFromDemisto(): customFields:', customFields);
    let chosenIncidentFields: IncidentField[] = [];
    let skippedIncidentFields = [];

    Object.keys(customFields).forEach( shortName => {
      let value = customFields[shortName];
      let tmpField: IncidentField = {
        shortName,
        value,
        originalValue: value,
        enabled: false,
        custom: true,
        mappingMethod: 'static',
        jmesPath: '',
        permitNullValue: false,
        dateConfig: {}
      };

      if (!this.fetchedIncidentFieldDefinitions) {
        // no fields currently defined
        tmpField.locked = true;
        tmpField.fieldType = 'undefined';
        tmpField.lockedReason = 'No fields are currently available from XSOAR';
      }

      else if (this.fetchedIncidentFieldDefinitions && shortName in this.fetchedIncidentFieldDefinitions) {
        // field was defined in fetchedIncidentFieldDefinitions
        const fetchedField = this.fetchedIncidentFieldDefinitions[shortName];
        for (const fieldType of this.blacklistedFieldTypes) {
          // skip blacklisted field types
          if (fieldType === fetchedField.type) {
            console.log(`Not adding field '${shortName}' of blacklisted type '${fieldType}'`);
            skippedIncidentFields.push(shortName);
            // tmpField.locked = true;
            // tmpField.lockedReason = `Field type ${fieldType} is not supported for import`;
            return;
          }
        }

        if (fetchedField.isReadOnly) {
          skippedIncidentFields.push(shortName);
          console.warn(`Not adding read-only incident field '${shortName}'`);
          return;
        }

        tmpField.longName = fetchedField.name;
        tmpField.locked = false;
        tmpField.fieldType = fetchedField.type;
      }

      else {
        // field isn't defined in fetchedIncidentFieldDefinitions
        tmpField.locked = true;
        tmpField.fieldType = 'undefined';
        tmpField.lockedReason = 'This field is not defined in XSOAR';
      }

      chosenIncidentFields.push(tmpField);
    });

    console.log('FreeformJsonUIComponent: buildCustomFieldsFromDemisto(): chosenIncidentFields:', chosenIncidentFields);
    console.log(`Non-added custom fields:`, skippedIncidentFields);
    return chosenIncidentFields;
  }



  incidentFieldConfigToIncidentField(config: IncidentFieldConfig): IncidentField {
    const newConfig: IncidentField = {
      shortName: config.shortName,
      custom: config.custom,
      fieldType: config.fieldType,
      enabled: config.enabled,
      mappingMethod: 'mappingMethod' in config ? config.mappingMethod : 'static',
      value: 'value' in config ? config.value : '',
      originalValue: 'mappingMethod' in config && config.mappingMethod === 'static' ? config.value : '',
      jmesPath: 'jmesPath' in config ? config.jmesPath : '',
      permitNullValue: 'permitNullValue' in config ? config.permitNullValue : false,
      locked: false
    };
    if ('dateConfig' in config) {
      newConfig.dateConfig = {};
      'autoParse' in config.dateConfig ? newConfig.dateConfig.autoParse = config.dateConfig.autoParse : {};
      'formatter' in config.dateConfig ? newConfig.dateConfig.formatter = config.dateConfig.formatter : {};
      'precision' in config.dateConfig ? newConfig.dateConfig.precision = config.dateConfig.precision : {};
      'utcOffsetEnabled' in config.dateConfig ? newConfig.dateConfig.utcOffsetEnabled = config.dateConfig.utcOffsetEnabled : {};
      'utcOffset' in config.dateConfig ? newConfig.dateConfig.utcOffset = config.dateConfig.utcOffset : {};
    }
    return newConfig;
  }



  buildChosenFieldsFromConfig(incidentConfig: IncidentConfig) {
    /*
    Called from onConfigOpened()
    Builds incident fields from a loaded incident configuration
    Assigns result to this.chosenIncidentFields
    Totally blows away and replaces current field selections
    */
    console.log('FreeformJsonUIComponent: buildChosenFieldsFromConfig(): incidentConfig:', incidentConfig);
    // let incidentFields: IncidentFields = {};
    let chosenIncidentFields: IncidentField[] = [];
    let skippedInvestigationFields = [];
    let skippedIncidentFields = [];

    Object.values(incidentConfig.chosenFields).forEach( fieldConfig  => {
      // console.log('FreeformJsonUIComponent: buildIncidentFields(): shortName:', shortName);
      const shortName = fieldConfig.shortName;

      let newConfig = this.incidentFieldConfigToIncidentField(fieldConfig);

      if (investigationFields.includes(shortName)) {
        skippedInvestigationFields.push(shortName);
        return;
      }

      const fetchedIncidentFieldDefinitionsFound = this.fetchedIncidentFieldDefinitions;

      if (!fetchedIncidentFieldDefinitionsFound) {
        chosenIncidentFields.push( {
          ...newConfig,
          locked: true,
          lockedReason: 'No fields are currently available from XSOAR',
        });
        return;
      }

      const fetchedField = this.fetchedIncidentFieldDefinitions[shortName];

      if (!fetchedField) {
        console.log(`Field '${fieldConfig.shortName}' has been removed from the XSOAR field definitions`);
        newConfig.locked = true;
        newConfig.lockedReason = 'Field is not defined in XSOAR';
        newConfig.fieldType = 'undefined';
        // delete newConfig.longName;
      }

      else if (fetchedField.isReadOnly) {
        console.warn(`Not adding read-only incident field '${shortName}'`);
        skippedIncidentFields.push(shortName);
        return;
      }

      // skip blacklisted field types
      else if (this.blacklistedFieldTypes.includes(fetchedField.type)) {
        console.log(`Not adding field '${shortName}' of blacklisted type '${fetchedField.type}'`);
        skippedIncidentFields.push(shortName);
        return;
      }

      if (fetchedField) {
        newConfig.longName = fetchedField.name;
      }

      chosenIncidentFields.push(newConfig);
    } );

    this.chosenIncidentFields = chosenIncidentFields;

    console.log('FreeformJsonUIComponent: buildChosenFieldsFromConfig(): chosenIncidentFields:', this.chosenIncidentFields);
    console.log(`Non-added investigation fields:`, skippedInvestigationFields);
    console.log(`Non-added incident fields:`, skippedIncidentFields);
  }



  async onIncidentConfigOpened(selectedConfig: IncidentConfig) {
    // console.log('FreeformJsonUIComponent: onIncidentConfigOpened()');
    // this.json = selectedConfig.incident;
    // console.log('FreeformJsonUIComponent: onIncidentConfigOpened(): json:', this.json);
    this.buildChosenFieldsFromConfig(selectedConfig);
    this.buildIncidentFieldOptions(selectedConfig.incidentType);
    // this.mergeLoadedFieldConfig(selectedConfig);
    this.createInvestigation = selectedConfig.createInvestigation;
    this.saveAsButtonEnabled = true;
    this.selectedIncidentType = selectedConfig.incidentType;
    this.setSelectedIncidentTypeIsAvailable();
    this.defaultJsonConfigName = 'defaultJsonName' in selectedConfig ? selectedConfig.defaultJsonName : undefined;

    if (!this.fetchedIncidentTypeNames.includes(selectedConfig.incidentType)) {
      this.updateChosenFieldLocks();
    }

    if (this.defaultJsonConfigName) {
      try {
        await this.getJsonConfig(this.defaultJsonConfigName);
      }
      catch (error) {
        console.error('FreeformJsonUIComponent: onIncidentConfigOpened(): error:', error);
        this.messagesReplace.emit([ {
          severity: 'error',
          detail: `Error loading default JSON configuration ${this.defaultJsonConfigName}.  See console log for more info`,
          summary: 'Error'
        } ]);
      }

    }
  }



  onUploadIncidentJson(json: object) {
    this.json = json;
    this.buildChosenFieldsFromDemisto(json);
    this.buildIncidentFieldOptions((json as any).type);
    this.selectedIncidentType = (json as any).type;
    this.setSelectedIncidentTypeIsAvailable();
    this.createInvestigation = true;
    this.saveAsButtonEnabled = true;
    this.defaultJsonConfigName = undefined;
  }



  onIncidentSaveAsClicked() {
    console.log('FreeformJsonUIComponent: onIncidentSaveAsClicked()');
    this.showIncidentSaveAsDialog = true;
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      document.getElementsByClassName('saveAsDialog')[0].getElementsByTagName('input')[0].focus();
    }, 100);
  }



  buildSavedFieldConfig(fields: IncidentField[]): IncidentFieldsConfig {
    let res: IncidentFieldsConfig = {};
    // Object.values(fields).forEach( field => {
    for (const field of fields) {
      const name = field.shortName;
      const newField: IncidentFieldConfig  = {
        shortName: field.shortName,
        custom: field.custom,
        fieldType: field.fieldType,
        enabled: field.enabled,
        mappingMethod: field.mappingMethod
      };
      if (field.mappingMethod === 'static') {
        newField.value = field.value;
      }
      else if (field.mappingMethod === 'jmespath') {
        newField.jmesPath = field.jmesPath;
      }
      if (field.fieldType === 'date') {
        newField.dateConfig = field.dateConfig;
      }
      res[name] = newField;
    }
    return res;
  }



  async onIncidentSaveAsAccepted() {
    console.log('FreeformJsonUIComponent: onIncidentSaveAsAccepted()');

    let newIncidentConfigName: string;

    const incidentConfig: IncidentConfig = {
      name: this.saveAsConfigName,
      chosenFields: this.buildSavedFieldConfig(this.chosenIncidentFields),
      createInvestigation: this.createInvestigation,
      incidentType: this.selectedIncidentType
    };
    try {
      const res = await this.fetcherService.saveNewIncidentConfiguration(incidentConfig);
      this.messageWithAutoClear.emit({severity: 'success', summary: 'Successful', detail: `Configuration '${this.saveAsConfigName}' has been saved`});
      newIncidentConfigName = this.saveAsConfigName;
      this.saveAsConfigName = '';
    }
    catch (error) {
      console.error('FreeformJsonUIComponent: onIncidentSaveAsAccepted(): caught error saving field config:', error);
      return;
    }

    // Update Fields Configurations
    this.savedIncidentConfigurationsChanged.emit(newIncidentConfigName);
    this.showIncidentSaveAsDialog = false;
  }



  onIncidentSaveAsCanceled() {
    console.log('FreeformJsonUIComponent: onIncidentSaveAsCanceled()');
    this.showIncidentSaveAsDialog = false;
    this.saveAsConfigName = '';
  }



  async onIncidentSaveClicked() {
    console.log('FreeformJsonUIComponent(): onSaveClicked()');
    let incidentConfig: IncidentConfig = {
      name: this.loadedIncidentConfigName,
      id: this.loadedIncidentConfigId,
      chosenFields: this.buildSavedFieldConfig(this.chosenIncidentFields),
      createInvestigation: this.createInvestigation,
      incidentType: this.selectedIncidentType
    };
    // console.log('FreeformJsonUIComponent: onSaveClicked(): config:', config);
    try {
      let res = await this.fetcherService.saveIncidentConfiguration(incidentConfig);
    }
    catch (error) {
      console.error('FreeformJsonUIComponent: onSaveClicked(): caught error saving field config:', error);
      return;
    }
  }



  async loadFromDemisto(demistoIncidentToLoad: string, demistoEndpointToLoadFrom: string): Promise<boolean> {
    console.log('FreeformJsonUIComponent: loadFromDemisto()');

    let importResult: DemistoIncidentImportResult;
    try {
      importResult = await this.fetcherService.demistoIncidentImport(demistoIncidentToLoad, demistoEndpointToLoadFrom);
    }

    catch (error) {
      if ('message' in error) {
        error = error.message;
      }
      this.messagesReplace.emit( [{ severity: 'error', summary: 'Error', detail: `Error thrown pulling XSOAR incident ${demistoIncidentToLoad}: ${error}`}] );
      return false;
    }

    console.log('FreeformJsonUIComponent: loadFromDemisto(): importResult:', importResult);

    if (importResult.success) {
      this.json = importResult.incident;
      const incidentType = 'type' in importResult.incident ? importResult.incident.type : undefined;
      this.buildChosenFieldsFromDemisto(this.json);
      this.buildIncidentFieldOptions(incidentType);
      this.messageWithAutoClear.emit( { severity: 'success', summary: 'Success', detail: `Incident ${demistoIncidentToLoad} was successfully loaded from ${demistoEndpointToLoadFrom}`} );
      this.loadedIncidentConfigName = undefined;
      this.loadedIncidentConfigId = undefined;
      this.createInvestigation = true;
      this.saveAsButtonEnabled = true;
      this.defaultJsonConfigName = undefined;

      this.selectedIncidentType = incidentType;
      this.setSelectedIncidentTypeIsAvailable();
    }

    else if (importResult.error === `Query returned 0 results`) {
      this.messagesReplace.emit( [{ severity: 'error', summary: 'Failure', detail: `Incident ${demistoIncidentToLoad} was not found on XSOAR server ${demistoEndpointToLoadFrom}`}] );
    }

    else {
      this.messagesReplace.emit( [{ severity: 'error', summary: 'Error', detail: `Error returned fetching XSOAR incident ${demistoIncidentToLoad}: ${importResult.error}`}] );
    }
    return true;
  }



  updateFieldTypeAssociations() {
    console.log('FreeformJsonUIComponent: updateFieldTypeAssociations()');
    const foundFieldDefinitions = this.fetchedIncidentFieldDefinitions;

    if (!foundFieldDefinitions) {
      this.incidentTypesToAssociatedFieldNames = {};
      return;
    }

    const tmpFieldAssociations = {}; // incidentType: fieldnames
    let incidentTypeNames = this.fetchedIncidentTypeNames;
    for ( const incidentType of incidentTypeNames) {
      tmpFieldAssociations[incidentType] = []; // sure it overwrites, but who cares?
    }

    for (const fetchedField of Object.values(this.fetchedIncidentFieldDefinitions)) {
      const associatedToAll = fetchedField.associatedToAll;
      const associatedIncidentTypes = fetchedField.associatedTypes;

      if (associatedToAll) {
        for (const fieldName of incidentTypeNames) {
          tmpFieldAssociations[fieldName].push(fetchedField.cliName);
        }
      }

      else {
        // associated to specific incident types
        if (associatedIncidentTypes === null) {
          // some fields have no associated types assigned
          continue;
        }

        for (const incidentType of associatedIncidentTypes) {
          if (incidentType in tmpFieldAssociations) {
            tmpFieldAssociations[incidentType].push(fetchedField.cliName);
          }
        }
      }
    }

    this.incidentTypesToAssociatedFieldNames = tmpFieldAssociations;
  }



  /*onFetchedFieldDefinitionsChanged_NonDestructive() {
    console.log('FreeformJsonUIComponent: onFetchedFieldDefinitionsChanged_NonDestructive()');
  }*/



  async onReloadFieldDefinitions(serverId = this.currentDemistoEndpointName) {
    /*
    Reload Demisto Incident Fields and Merge

    Called from "Reload Definitions" button
    */

    console.log('FreeformJsonUIComponent: onReloadFieldDefinitions()');
    this.reloadFieldDefinitions.emit(serverId);
  }



  fieldLockCheck() {
    console.log('FreeformJsonUIComponent: fieldLockCheck()');
    const fetchedIncidentTypeNames = this.fetchedIncidentTypeNames;

    for (const field of this.chosenIncidentFields) {

      if (!field.custom) {
        continue;
      }

      const shortName = field.shortName;

      const foundFieldDefinitions = this.fetchedIncidentFieldDefinitions !== undefined;
      const fieldTypeSupported = ! this.blacklistedFieldTypes.includes(field.fieldType);
      const fieldFoundInFieldDefinitions = foundFieldDefinitions && shortName in this.fetchedIncidentFieldDefinitions;

      const foundIncidentTypes = this.fetchedIncidentTypes && this.fetchedIncidentTypes.length !== 0;
      const incidentTypeFoundInXSOAR = foundIncidentTypes && fetchedIncidentTypeNames.includes(this.selectedIncidentType );

      const fieldTypeApplicable = foundFieldDefinitions && incidentTypeFoundInXSOAR && this.incidentTypesToAssociatedFieldNames[this.selectedIncidentType].includes(field.shortName);

      const newFieldType = fieldFoundInFieldDefinitions ? this.fetchedIncidentFieldDefinitions[shortName].type : 'undefined';

      if (!foundFieldDefinitions) {
        // no fields currently defined
        field.locked = true;
        field.fieldType = 'undefined';
        field.lockedReason = 'No fields are currently available from XSOAR';
      }

      else if (!incidentTypeFoundInXSOAR) {
        field.locked = true;
        field.fieldType = newFieldType;
        field.lockedReason = 'The selected incident type is not defined in XSOAR';
      }

      else if (!fieldFoundInFieldDefinitions) {
        // field isn't defined in Demisto
        field.locked = true;
        field.fieldType = 'undefined';
        field.lockedReason = 'Field is not defined in XSOAR';
        delete field.longName;
      }

      else if (!fieldTypeSupported) {
        // field type not supported
        field.locked = true;
        field.fieldType = newFieldType;
        field.lockedReason = `Field type '${newFieldType}' is not supported`;
      }

      else if (!fieldTypeApplicable) {
        field.locked = true;
        field.fieldType = newFieldType;
        field.lockedReason = 'Field is not associated to the selected incident type in XSOAR';
      }

      else if (fieldFoundInFieldDefinitions) {
        field.locked = false;
        field.lockedReason = undefined;
        field.fieldType = this.fetchedIncidentFieldDefinitions[shortName].type;
        field.longName = this.fetchedIncidentFieldDefinitions[shortName].name;
      }

      // field.enabled = !field.locked ? field.enabled : false;
      // Don't mess with the enabled property -- we don't want users to lose their enabled value just because something got messed up on the back end or whatnot.  Rely on incident creation to skip locked fields.
    }
  }



  updateChosenFieldLocks(triggerChangeDetection = true) {
    console.log('FreeformJsonUIComponent: updateChosenFieldLocks()');
    // Locks chosen fields which are no longer available or applicable to the incident type, and unlocks fields which are available.
    // Called when switching XSOAR servers, deleting the active XSOAR server, updating the active XSOAR server config, and when switching incident types
    // Called by AppComponent:switchCurrentDemistoEndpoint(), AppComponent:onDeleteDemistoEndpointConfirmed(), and AppComponent:onDemistoEndpointUpdated()

    const chosenIncidentFieldsDefined = this.chosenIncidentFields.length !== 0;

    if (!chosenIncidentFieldsDefined) {
      console.log('FreeformJsonUIComponent: updateChosenFieldLocks(): chosenIncidentFields is not defined.  Returning');
      return;
    }

    this.updateFieldTypeAssociations();

    this.fieldLockCheck();

    if (triggerChangeDetection) {
      this.chosenIncidentFields = JSON.parse(JSON.stringify(this.chosenIncidentFields)); // deep copy hack to trigger change detection
    }
  }


  onCreateIncidentFromRawJsonClicked() {
    this.showCreateIncidentFromJsonDialog = true;
  }



  onCreateIncidentFromRawJsonCancelled() {
    this.showCreateIncidentFromJsonDialog = false;
  }



  async onSetDefaultIncidentJsonFile(unset = false) {
    console.log('FreeformJsonUIComponent: onSetDefaultIncidentJsonFile()');
    if (!unset) {
      try {
        await this.fetcherService.setDefaultIncidentJsonFile(this.loadedIncidentConfigName, this.loadedJsonConfigName);
        this.defaultJsonConfigName = this.loadedJsonConfigName;
        this.savedIncidentConfigurationsChanged.emit(this.loadedIncidentConfigName);
      }
      catch (error) {
        console.error(`FreeformJsonUIComponent: onSetDefaultIncidentJsonFile(): Caught error setting default JSON file for incident config ${this.loadedIncidentConfigName}:`, error);
      }
    }
    else {
      try {
        await this.fetcherService.clearDefaultIncidentJsonFile(this.loadedIncidentConfigName);
        this.defaultJsonConfigName = undefined;
        this.savedIncidentConfigurationsChanged.emit(this.loadedIncidentConfigName);
      }
      catch (error) {
        console.error(`FreeformJsonUIComponent: onSetDefaultIncidentJsonFile(): Caught error clearing default JSON file for incident config ${this.loadedIncidentConfigName}:`, error);
      }
    }
  }

}
