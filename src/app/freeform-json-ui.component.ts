import { Component, OnInit, Input, Output, EventEmitter, ChangeDetectorRef, ViewChildren, ViewChild, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { FetcherService, FieldMappingSelection } from './fetcher-service';
import { SelectItem, ConfirmationService } from 'primeng/api';
import { PMessageOption } from './types/message-options';
import { Listbox } from 'primeng/listbox';
import { FetchedIncidentFieldDefinitions } from './types/fetched-incident-field';
import { IncidentFieldUI, IncidentFieldsUI, DateConfig } from './types/incident-field';
import { FetchedIncidentType } from './types/fetched-incident-type';
import { FreeformJsonRowComponent } from './freeform-json-row.component';
// import { SampleIncident } from './sample-json';
import { Subscription } from 'rxjs';
import * as utils from './utils';
import { JSONConfig, JSONConfigRef, JSONConfigRefs } from './types/json-config';
import { IncidentConfig, IncidentConfigs, IncidentFieldConfig, IncidentFieldsConfig } from './types/incident-config';
import { IncidentCreationConfig } from './types/incident-config';
import { InvestigationFields as investigationFields } from './investigation-fields';
import { DemistoIncidentImportResult } from './types/demisto-incident-import-result';
import { DialogService, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { JsonEditorComponent } from './json-editor/json-editor.component';
import { FileAttachmentConfig, FileAttachmentConfigs, AttachmentFieldConfig, FileAttachmentUIConfig, FileToPush } from './types/file-attachment';
import { DemistoEndpoints } from './types/demisto-endpoint';
import { JsonGroups } from './types/json-group';
import dayjs from 'dayjs';
import utc from 'node_modules/dayjs/plugin/utc';
dayjs.extend(utc);
declare const jmespath: any;

const defaultIncidentFieldsToAdd = [
  'details',
  'name',
  'owner',
  'severity',
  'type',
];

const whitelistedInternalFieldNames = ['attachment', 'feedbased', 'labels'];



@Component({
  selector: 'freeform-json-ui',
  templateUrl: './freeform-json-ui.component.html',
  providers: [ DialogService ]
})

export class FreeformJsonUIComponent implements OnInit, OnChanges, OnDestroy {

  constructor(
    private fetcherService: FetcherService, // import our URL fetcher
    private confirmationService: ConfirmationService,
    private changeDetector: ChangeDetectorRef,
    public dialogService: DialogService
  ) {}

  @ViewChildren('incidentFieldRow') freeformRowComponents: FreeformJsonRowComponent[];
  @ViewChild('incidentFieldListBox') incidentFieldListBoxComponent: Listbox;

  @Input() loadedIncidentConfigName: string; // must clear when loaded from json or when current config is deleted
  @Input() loadedIncidentConfigId: string;
  @Input() currentDemistoEndpointId: string;
  @Input() fetchedIncidentFieldDefinitions: FetchedIncidentFieldDefinitions; // the fields taken from Demisto
  @Input() demistoEndpoints: DemistoEndpoints;

  _fetchedIncidentTypes: FetchedIncidentType[];
  fetchedIncidentTypeNames: string[];
  @Input() set fetchedIncidentTypes(value: FetchedIncidentType[]) {
    // the incident types taken from Demisto
    this._fetchedIncidentTypes = value;
    this.fetchedIncidentTypeNames = value.map( incidentType => incidentType.name );
  }
  get fetchedIncidentTypes(): FetchedIncidentType[] {
    return this._fetchedIncidentTypes;
  }
  @Input() loadDefaultChosenFields: boolean;

  @Input() savedIncidentConfigurations: IncidentConfigs;
  @Output() savedIncidentConfigurationsChanged = new EventEmitter<string>();
  @Input() demistoEndpointsItems: SelectItem[]; // holds list of endpoints for PrimeNG

  // PrimeNG Messages Popup Outputs
  @Output() messagesReplace = new EventEmitter<PMessageOption[]>();
  @Output() messageWithAutoClear = new EventEmitter<PMessageOption>();
  @Output() messageAdd = new EventEmitter<PMessageOption>();


  @Output() saveButtonEnabledChange = new EventEmitter<boolean>();
  @Output() reloadFieldDefinitions = new EventEmitter<string>();

  availableIncidentFields: IncidentFieldsUI; // our incident fields
  chosenIncidentFields: IncidentFieldUI[] = []; // incident fields that have been added to the config
  requiresJson = false;
  incidentTypesToAssociatedFieldNames: object = {}; // incidentType: fieldnames

  // Raw JSON
  json: object;
  loadedJsonConfigId: string;
  loadedJsonConfigName: string;
  incidentJson: object;
  defaultJsonConfigId: string;
  defaultJsonConfigName: string;
  @Input() savedJsonConfigurations: JSONConfigRef[];
  @Input() savedJsonConfigurationsObj: JSONConfigRefs;
  @Input() savedJsonConfigurationItems: SelectItem[];
  @Output() freeformJsonConfigurationsChanged = new EventEmitter<void>();

  // Blacklisted field types
  blacklistedFieldTypes = ['timer'];

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

  incidentTypeItems: SelectItem[];
  chosenTypeItems: SelectItem[];
  incidentFieldsToAddItems: SelectItem[];
  createInvestigationButtonItems: SelectItem[] = [
    { value: true, label: 'Enabled' },
    { value: false, label: 'Disabled' }
  ];

  // UI State
  displayIncidentFieldShortNames = true;
  incidentFieldsSelectAllState = false;
  selectionMode = false;
  selectionModeFieldType: string;
  showCreateIncidentFromJsonDialog = false;
  enabledFieldsCount = 0;

  // Delete JSON Config dialog
  showDeleteJsonConfigDialog = false;
  selectedDeleteJsonConfigIds: string[] = [];

  // JSON Open dialog
  showJsonOpenDialog = false;
  selectedJsonOpenConfig = '';

  // JSON Save As Dialog
  showJsonSaveAsDialog = false;
  jsonSaveAsConfigName = ''; // for text label
  get jsonSaveAsOkayButtonDisabled(): boolean {
    for (const config of this.savedJsonConfigurations) {
      if (config.name === this.jsonSaveAsConfigName) {
        return true;
      }
    }
    return false;
  }

  // Incident Save As Dialog
  showIncidentSaveAsDialog = false;
  incidentSaveAsConfigName = ''; // for text label
  get incidentSaveAsOkayButtonDisabled(): boolean {
    return this.savedIncidentConfigurations.hasOwnProperty(this.incidentSaveAsConfigName);
  }

  // File Attachments Config & UI
  @Input() fileAttachmentConfigs: FileAttachmentConfigs;
  @Input() fileAttachmentConfigsList: FileAttachmentConfig[];
  @Output() fileAttachmentConfigsChanged = new EventEmitter<void>();

  // Incident Created Dialog
  showIncidentCreatedDialog = false;
  showIncidentJsonInCreateResults = false;
  incidentCreatedId: number;
  incidentCreatedVersion: number;
  incidentCreatedError: string;
  hasAnEnabledAttachmentField = false;

  // JSON Groups
  @Input() jsonGroupConfigurations: JsonGroups;
  @Input() jsonGroupConfigurationsItems: SelectItem[];
  defaultJsonGroupId: string;
  defaultJsonGroupName: string;

  // Default JSON / JSON Config Dialog
  showDefaultJsonDialog = false;
  // tslint:disable-next-line:variable-name
  defaultJsonDialog_selectedJsonId: string;
  // tslint:disable-next-line:variable-name
  defaultJsonDialog_selectedJsonGroupId: string;

  // Rename Incident Config Dialog
  showRenameIncidentConfigDialog = false;
  renameIncidentConfigName: string;
  get renameIncidentConfigAcceptButtonDisabled(): boolean {
    return this.renameIncidentConfigName && Object.values(this.savedIncidentConfigurations).map(config => config.name).includes(this.renameIncidentConfigName);
  }

  // Rename Json File Dialog
  showRenameJsonFileDialog = false;
  renameJsonFileName: string;
  get renameJsonFileAcceptButtonDisabled(): boolean {
    return this.renameJsonFileName && Object.values(this.savedJsonConfigurationsObj).map(jsonConfig => jsonConfig.name).includes(this.renameJsonFileName);
  }

  // RxJS Subscriptions
  private subscriptions = new Subscription();



  ngOnInit() {
    console.log('FreeformJsonUIComponent: ngOnInit(): fetchedIncidentFieldDefinitions:', this.fetchedIncidentFieldDefinitions);

    // setTimeout( () => this.json = SampleIncident ); // used for testing -- comment out before committing to dev/master

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

    if (utils.firstOrChangedSimpleChange('fetchedIncidentTypes', values)) {
      this.buildIncidentTypeItems();
    }

    if (utils.changedSimpleChange('fetchedIncidentFieldDefinitions', values)) {
      this.updateChosenFieldLocks(false);
    }

    if (utils.changedSimpleChange('loadedIncidentConfigId', values) && this.loadedIncidentConfigId === undefined) {
      this.defaultJsonConfigId = undefined;
      this.defaultJsonConfigName = undefined;
      this.defaultJsonGroupId = undefined;
      this.defaultJsonGroupName = undefined;
    }
  }



  ngOnDestroy() {
    console.log('FreeformJsonUIComponent: ngOnDestroy()');
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
    const attachmentsDefaultValue = [];
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
      case 'attachments':
        return attachmentsDefaultValue;
    }
  }



  buildIncidentFieldOptions(incidentType, addDefaultChosenFields = false) {
    // called from onIncidentTypeChanged()
    // builds availableIncidentFields and optionally chosenIncidentFields
    // will blow away chosenIncidentFields if addDefaultChosenFields === true
    console.log('FreeformJsonUIComponent: buildIncidentFieldOptions(): incidentType:', incidentType);

    let incidentFields: IncidentFieldsUI = {};
    let chosenIncidentFields: IncidentFieldUI[] = [];

    for (let field of Object.values(this.fetchedIncidentFieldDefinitions)  ) {
      // console.log('FreeformJsonUIComponent: buildIncidentFieldOptions(): field:', field);
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

      if (type === 'internal' && ! whitelistedInternalFieldNames.includes(shortName) )
      {
        continue;
      }

      if (!associatedToAll && ( !field.associatedTypes || !field.associatedTypes.includes(incidentType) ) ) {
        // skip fields which aren't associated with this incident type
        continue;
      }

      const incidentField: IncidentFieldUI = {
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

      if (addDefaultChosenFields && defaultIncidentFieldsToAdd.includes(shortName)) {
        // add default fields to added incident fields
        chosenIncidentFields.push(incidentField);
      }
    }

    this.availableIncidentFields = incidentFields;
    if (addDefaultChosenFields) {
      this.chosenIncidentFields = chosenIncidentFields;
      this.calculateRequiresJson();
    }

    this.countEnabledFields();

    console.log('FreeformJsonUIComponent: buildIncidentFieldOptions(): availableIncidentFields:', this.availableIncidentFields);
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
      (document.getElementsByClassName('addIncidentFieldListbox')[0].getElementsByClassName('p-inputtext')[0] as HTMLInputElement).focus();
    }, 200 );
  }



  buildFieldsToAddItems(availableFields: IncidentFieldsUI, chosenFields: IncidentFieldUI[]): SelectItem[] {
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



  getFieldFromChosenFields(shortName: string): IncidentFieldUI {
    for (let field of this.chosenIncidentFields) {
      if (field.shortName === shortName) {
        return field;
      }
    }
    return undefined;
  }



  chosenFieldsSortCompare(a: IncidentFieldUI, b: IncidentFieldUI) {
    return a.shortName > b.shortName ? 1 : -1;
  }



  setFieldOfChosenFields(newField: IncidentFieldUI, assign = true) {
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
    console.log('FreeformJsonUIComponent: onAddIncidentFieldsAccept(): selectedFieldsToAdd:', this.selectedFieldsToAdd);
    console.log('FreeformJsonUIComponent: onAddIncidentFieldsAccept(): chosenIncidentFields:', JSON.parse(JSON.stringify(this.chosenIncidentFields)));
    for (const fieldName of this.selectedFieldsToAdd) {
      const field: IncidentFieldUI = this.availableIncidentFields[fieldName];
      this.setFieldOfChosenFields(this.availableIncidentFields[fieldName]);
    }
    // console.log('FreeformJsonUIComponent: onAddIncidentFieldsAccept(): chosenIncidentFields:', this.chosenIncidentFields);
    this.selectedFieldsToAdd = [];
    this.incidentFieldListBoxComponent._filterValue = '';
    this.displayAddIncidentFieldDialog = false;
    console.log('FreeformJsonUIComponent: onAddIncidentFieldsAccept(): chosenIncidentFields:', this.chosenIncidentFields);
  }



  onDeleteAllIncidentFieldsClicked() {
    console.log(`FreeformJsonUIComponent: onDeleteAllIncidentFieldsClicked()`);
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
    this.requiresJson = false;
  }



  onIncidentFieldRemoved(cliName: string) {
    console.log('FreeformJsonUIComponent: onIncidentFieldRemoved(): cliName:', cliName);
    this.deleteChosenField(cliName);
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



  trackByIdentity(index, field: IncidentFieldUI)  {
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

    this.hasAnEnabledAttachmentField = utils.fieldsHaveEnabledAttachmentField(this.chosenIncidentFields);

    const filesToPush: FileToPush[] = [];

    let incident: IncidentCreationConfig = {
      serverId: this.currentDemistoEndpointId,
      createInvestigation: this.hasAnEnabledAttachmentField ? false : this.createInvestigation // if we are uploading attachments to the incident, we don't want the playbook to run until after the attachments have been uploaded
    };


    for (const freeformRowComponent of this.freeformRowComponents) {
      const field: IncidentFieldUI = freeformRowComponent.field;

      const isAttachmentField = field.shortName === 'attachment' || field.fieldType === 'attachments';
      const hasAttachments = isAttachmentField && utils.isArray(field.attachmentConfig) && field.attachmentConfig.length !== 0;

      if (field.locked || !field.enabled) {
        continue;
      }

      if (isAttachmentField) {

        if (!hasAttachments) {
          continue;
        }

        // Push attachments into array of attachments to be uploaded to the incident after initial incident creation
        for (const attachment of field.attachmentConfig) {
          const isMediaFile = utils.isUIAttachmentMediaFile(attachment);

          const fileToPush: FileToPush = {
            attachmentId: attachment.id,
            incidentFieldName: field.shortName,
            serverId: this.currentDemistoEndpointId,
            filename: attachment.overrideFilename ? attachment.filename : attachment.originalFilename,
            last: false // will set the last value later
          };

          if (isMediaFile) {
            fileToPush.mediaFile = attachment.overrideMediaFile ? attachment.mediaFile : attachment.originalMediaFile;
          }

          if (attachment.overrideComment) {
            fileToPush.comment = attachment.comment;
          }

          else if (attachment.originalComment !== '') {
            fileToPush.comment = attachment.originalComment;
          }

          filesToPush.push(fileToPush);
        }
      }

      else if (field.mappingMethod === 'static') {
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

    if (filesToPush.length !== 0)  {
      // Causes the playbook to run after the last file has been uploaded, if the user wants to create an investigation.  It always needs to happen as Demisto will leave a lock open until it receives an attachment with last:true
      filesToPush[filesToPush.length - 1].last = true;
    }

    console.log('FreeformJsonUIComponent: onCreateIncident(): incident:', incident);
    console.log('FreeformJsonUIComponent: onCreateIncident(): filesToPush:', filesToPush);

    let res;
    try {
      res = await this.fetcherService.createDemistoIncident(incident);
      // console.log('FreeformJsonUIComponent: onCreateIncident(): res:', res);
      this.incidentJson = incident;
    }
    catch (error) {
      console.error(error);
      this.showIncidentCreatedDialog = true;
      this.incidentCreatedId = undefined;
      let result: any;
      if ('error' in error) {
        // fetches inner HTTP body
        result = error.error;
      }
      if (result && 'statusCode' in result && 'statusMessage' in result) {
        this.incidentCreatedError = `XSOAR HTTP Status: ${result.statusCode}: "${result.statusMessage}"`;
      }
      else if (result && 'error' in result) {
        this.incidentCreatedError = result.error;
      }
      else if ('message' in error) {
        this.incidentCreatedError = error.message;
      }
      else {
        console.error(error);
        this.incidentCreatedError = 'Unhandled exception whilst submitting incident.  Check browser console log for error.';
      }
      // const resultMessage = `Incident creation failed with XSOAR status code ${res.statusCode}: "${res.statusMessage}"`;
      // this.messagesReplace.emit( [{ severity: 'error', summary: 'Failure', detail: resultMessage}] );
      return;
    }


    if (res.success) {

      let success = true;
      let dbVersion;

      const incidentId = res.id;

      if (filesToPush.length !== 0) {
        // now upload files to XSOAR
        this.messagesReplace.emit( [{ severity: 'info', summary: 'Info', detail: 'Uploading files to incident'}] );
        let errors = 0;
        for (const fileToPush of filesToPush) {
          fileToPush.incidentId = incidentId;
          let result;
          try {
            result = await this.fetcherService.uploadFileToDemistoIncident(fileToPush);
            dbVersion = result.version;
            this.messageAdd.emit({ severity: 'success', summary: 'Success', detail: `Uploaded ${fileToPush.filename}`});
          }
          catch (error) {
            success = false;
            console.log('FreeformJsonUIComponent: onCreateIncident(): attachment upload result:', result);
            errors++;
            if (errors === 1) {
              this.messagesReplace.emit([]);
            }
            if (error) {
              this.messageAdd.emit({ severity: 'error', summary: 'Error', detail: `File upload failed with ${error.message}`});
            }
            else {
              this.messageAdd.emit({ severity: 'error', summary: 'Error', detail: `File upload failed with unspecified unknown`});
            }
          }
        }
      }

      if (success) {
        this.showIncidentCreatedDialog = true;
        this.showIncidentJsonInCreateResults = true;
        this.incidentCreatedId = incidentId;
        this.incidentCreatedVersion = dbVersion;
        this.incidentCreatedError = undefined;
        // this.messagesReplace.emit( [{ severity: 'success', summary: 'Success', detail: `XSOAR incident created with id ${incidentId}`}] );
      }

    }
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



  onFieldChange(field: IncidentFieldUI) {
    // console.log('FreeformJsonUIComponent: onFieldChange():', field.shortName);
    this.setFieldOfChosenFields(field, false);
  }



  sortChosenFields(a: IncidentFieldUI, b: IncidentFieldUI): number {
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
    let chosenIncidentFields: IncidentFieldUI[] = [];
    let customFields: IncidentFieldUI[] = [];
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

      const newIncidentField: IncidentFieldUI  = {
        shortName,
        longName: fetchedField.name,
        enabled: ['type', 'name', 'occurred', 'details', 'labels'].includes(shortName) && ! [undefined, ''].includes(value) ? true : false,
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
    this.requiresJson = false;
    console.log(`FreeformJsonUIComponent: buildIncidentFieldsFromDemisto(): Non-added investigation fields:`, skippedInvestigationFields);
    console.log(`FreeformJsonUIComponent: buildIncidentFieldsFromDemisto(): Non-added incident fields:`, skippedIncidentFields);
    console.log('FreeformJsonUIComponent: buildIncidentFieldsFromDemisto(): chosenIncidentFields:', this.chosenIncidentFields);
  }



  buildCustomFieldsFromDemisto(customFields): IncidentFieldUI[] {
    /*
    Called from buildIncidentFields()
    */
    // console.log('FreeformJsonUIComponent: buildCustomFieldsFromDemisto(): customFields:', customFields);
    let chosenIncidentFields: IncidentFieldUI[] = [];
    let skippedIncidentFields = [];

    Object.keys(customFields).forEach( shortName => {
      if (shortName === '') {
        // Incidents sometimes return from XSOAR with a blank custom fields entry, for some strange reason
        return;
      }

      let value = customFields[shortName];
      let tmpField: IncidentFieldUI = {
        shortName,
        value,
        originalValue: value,
        enabled: [undefined, ''].includes(value) ? false : true,
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
            console.warn(`Not adding field '${shortName}' of blacklisted type '${fieldType}'`);
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
        console.warn(`Field ${shortName} not defined in XSOAR`);
        tmpField.locked = true;
        tmpField.fieldType = 'undefined';
        tmpField.lockedReason = 'This field is not defined in XSOAR';
      }

      if (['grid', 'internal'].includes(tmpField.fieldType) && typeof tmpField.value === 'object' && JSON.stringify(tmpField.value) === '[]') {
        tmpField.enabled = false;
        console.log(`grid: ${shortName}, value:`, value);
      }

      chosenIncidentFields.push(tmpField);
    });


    console.log('FreeformJsonUIComponent: buildCustomFieldsFromDemisto(): chosenIncidentFields:', chosenIncidentFields);
    console.log(`Non-added custom fields:`, skippedIncidentFields);
    return chosenIncidentFields;
  }



  incidentFieldConfigToIncidentFieldUI(config: IncidentFieldConfig): IncidentFieldUI {
    // Converts an IncidentFieldConfig (loaded from an incident config) to IncidentFieldUI
    const newConfig: IncidentFieldUI = {
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
      const propertiesToMerge = ['autoParse', 'formatter', 'precision', 'utcOffsetEnabled', 'utcOffset'];
      newConfig.dateConfig = utils.mergeParticularObjectProperties(propertiesToMerge, config.dateConfig, {});
    }

    if ('attachmentConfig' in config) { {
      const attachmentConfigs: AttachmentFieldConfig[] = config.attachmentConfig;
      const uiAttachmentConfigs: FileAttachmentUIConfig[] = [];

      for (const attachmentConfig of attachmentConfigs) {
        const id = attachmentConfig.id;
        const serverAttachmentConfig = this.fileAttachmentConfigs[id];

        const newUIAttachmentConfig: FileAttachmentUIConfig = {
          id,
          size: serverAttachmentConfig.size,
          detectedType: serverAttachmentConfig.detectedType,

          originalFilename: serverAttachmentConfig.filename,
          overrideFilename: 'filenameOverride' in attachmentConfig ? true : false,
          filename: 'filenameOverride' in attachmentConfig ? attachmentConfig.filenameOverride : serverAttachmentConfig.filename,

          overrideMediaFile: 'mediaFileOverride' in attachmentConfig ? true : false,
          originalMediaFile: serverAttachmentConfig.mediaFile,
          mediaFile: 'mediaFileOverride' in attachmentConfig ? attachmentConfig.mediaFileOverride : serverAttachmentConfig.mediaFile,

          overrideComment: 'commentOverride' in attachmentConfig ? true : false,
          originalComment: serverAttachmentConfig.comment,
          comment: 'commentOverride' in attachmentConfig ? attachmentConfig.commentOverride : serverAttachmentConfig.comment,

        };

        uiAttachmentConfigs.push(newUIAttachmentConfig);
      }

      newConfig.attachmentConfig = uiAttachmentConfigs;
    }

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
    let chosenIncidentFields: IncidentFieldUI[] = [];
    let skippedInvestigationFields = [];
    let skippedIncidentFields = [];

    Object.values(incidentConfig.chosenFields).forEach( chosenField  => {
      // console.log('FreeformJsonUIComponent: buildIncidentFields(): shortName:', shortName);
      const shortName = chosenField.shortName;

      let newConfig = this.incidentFieldConfigToIncidentFieldUI(chosenField);

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
        console.log(`Field '${chosenField.shortName}' has been removed from the XSOAR field definitions`);
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
    this.calculateRequiresJson();

    console.log('FreeformJsonUIComponent: buildChosenFieldsFromConfig(): chosenIncidentFields:', this.chosenIncidentFields);
    console.log(`Non-added investigation fields:`, skippedInvestigationFields);
    console.log(`Non-added incident fields:`, skippedIncidentFields);
  }



  async getJsonConfig(configId) {
    console.log('FreeformJsonUIComponent: getJsonConfig(): configId:', configId);
    // we want the calling function to use its own try/catch blocks, as error handling can differ depending on use case.
    const res = await this.fetcherService.getSavedJSONConfiguration(configId);
    this.json = res.json;
    this.loadedJsonConfigId = configId;
    this.loadedJsonConfigName = res.name;
  }



  buildSavedFieldConfig(fields: IncidentFieldUI[]): IncidentFieldsConfig {
    const savedFieldConfig: IncidentFieldsConfig = {};
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
      if (field.fieldType === 'attachments' || field.shortName === 'attachment') {
        if (field.attachmentConfig) {
          // attachment fields may not have any field configs yet
          newField.attachmentConfig = this.FileAttachmentUIConfigToAttachmentFieldConfig(field.attachmentConfig);
        }
      }
      savedFieldConfig[name] = newField;
    }
    return savedFieldConfig;
  }



  FileAttachmentUIConfigToAttachmentFieldConfig(fileAttachmentUIConfigs: FileAttachmentUIConfig[]): AttachmentFieldConfig[] {
    console.log('FreeformJsonUIComponent: FileAttachmentUIConfigToAttachmentFieldConfig(): fileAttachmentUIConfigs:', fileAttachmentUIConfigs);

    const newAttachmentFieldConfigs: AttachmentFieldConfig[] = [];

    for (const uiConfig of fileAttachmentUIConfigs) {

      const newAttachmentFieldConfig: AttachmentFieldConfig = {
        id: uiConfig.id,
      };

      if (uiConfig.overrideFilename) {
        newAttachmentFieldConfig.filenameOverride = uiConfig.filename;
      }

      if (uiConfig.overrideMediaFile) {
        newAttachmentFieldConfig.mediaFileOverride = uiConfig.mediaFile;
      }

      if (uiConfig.overrideComment) {
        newAttachmentFieldConfig.commentOverride = uiConfig.comment;
      }

      newAttachmentFieldConfigs.push(newAttachmentFieldConfig);
    }

    return newAttachmentFieldConfigs;
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



  async onReloadFieldDefinitions(serverId = this.currentDemistoEndpointId) {
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
      this.calculateRequiresJson();
    }
  }



  onViewJsonClicked() {
    console.log('FreeformJsonUIComponent: onViewBulkIncidentJSONClicked()');

    let config: DynamicDialogConfig = {
      header: `JSON Config ${this.loadedJsonConfigName ? '\'' + this.loadedJsonConfigName + '\'' : undefined }'`,
      closable: true,
      closeOnEscape: true,
      data: {
        value: this.json,
        readOnly: true,
        showResetValues: false
      },
      width: '95%',
      height: '90%'
    };
    const dialogRef = this.dialogService.open(JsonEditorComponent, config);
  }



  onEditJsonClicked() {
    console.log('FreeformJsonUIComponent: onEditJsonClicked()');

    let config: DynamicDialogConfig = {
      header: `JSON Config ${this.loadedJsonConfigName ? '\'' + this.loadedJsonConfigName + '\'' : undefined }'`,
      closable: true,
      closeOnEscape: true,
      data: {
        value: this.json,
        readOnly: false,
        showResetValues: true
      },
      width: '95%',
      height: '90%'
    };
    const dialogRef = this.dialogService.open(JsonEditorComponent, config);
    dialogRef.onClose.subscribe( value => this.onEditJsonAccepted(value) );
  }



  onEditJsonAccepted(newJson?: object) {
    if (newJson) {
      this.json = newJson;
    }
  }



  onDownloadJsonClicked() {
    console.log('FreeformJsonUIComponent: onDownloadJsonClicked()');
    const filename = this.loadedJsonConfigName !== undefined ? this.loadedJsonConfigName : `untitled.json`;
    this.fetcherService.downloadJSONFile(this.json, filename);
  }



  calculateRequiresJson() {
    let requiresJson = false;
    for (const field of Object.values(this.chosenIncidentFields)) {
      if (field.mappingMethod === 'jmespath' && field.jmesPath !== '' && !field.permitNullValue) {
        requiresJson = true;
        break;
      }
    }
    this.requiresJson = requiresJson;
  }



  onAttachmentsRemovedFromServer() {
    // When a file attachment gets deleted, the server will remove it from any
    // incident configs that the attachment was part of.  This method will remove any attachments from the ui that are no longer part of the config (the incident config will have already been updated)

    console.log('FreeformJsonUIComponent: onAttachmentsRemovedFromServer()');

    const fileAttachmentIds = Object.keys(this.fileAttachmentConfigs);
    for (const field of this.chosenIncidentFields) {

      if ('attachmentConfig' in field) {

        for (let i = field.attachmentConfig.length - 1; i >= 0; i--) {
          const attachment = field.attachmentConfig[i];

          if (!(attachment.id in fileAttachmentIds)) {
            field.attachmentConfig.splice(i, 1);
            break;
          }

        }
      }
    }
  }



  onAttachmentsEdited() {
    // This will update the UI if an attachment is modified on the backend.
    console.log('FreeformJsonUIComponent: onAttachmentsEdited()');

    for (const field of this.chosenIncidentFields) {

      if ('attachmentConfig' in field && field.attachmentConfig) {

        for (const attachment of field.attachmentConfig) {
          const fileAttachmentConfig = this.fileAttachmentConfigs[attachment.id];

          console.log('fileAttachmentConfig.filename:', fileAttachmentConfig.filename);

          attachment.originalFilename = fileAttachmentConfig.filename;
          attachment.originalComment = fileAttachmentConfig.comment;
          attachment.originalMediaFile = fileAttachmentConfig.mediaFile;
        }
      }
    }
  }



  /// Upload JSON Config ///

  onFreeformJsonUploaded(data: { files: File }, uploadRef) {
    let file = data.files[0];
    console.log('FreeformJsonUIComponent: onFreeformJsonUploaded(): file:', file);

    let reader = new FileReader();

    reader.onloadend = (progressEvent: ProgressEvent) => {
      try {
        this.json = JSON.parse(reader.result as string);
        this.loadedJsonConfigId = undefined;
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

  /// End Upload JSON Config ///



  /// Open JSON Config ///

  onJsonOpenClicked() {
    console.log('FreeformJsonUIComponent: onJsonOpenClicked()');
    this.showJsonOpenDialog = true;
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      (document.getElementsByClassName('openJsonDialog')[0].getElementsByClassName('p-inputtext')[1] as HTMLInputElement).focus();
    }, 200);
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



  onJsonOpenCancelled() {
    console.log('FreeformJsonUIComponent: onJsonOpenCancelled()');
    this.showJsonOpenDialog = false;
  }

  /// END Open JSON Config ///



  /// Save JSON ///



  async saveJsonConfig() {
    const jsonConfig: JSONConfig = {
      id: this.loadedJsonConfigId,
      name: this.loadedJsonConfigName,
      json: this.json
    };
    await this.fetcherService.saveUpdatedFreeformJSONConfiguration(jsonConfig);
  }



  async onJsonSaveClicked() {
    console.log('FreeformJsonUIComponent: onJsonSaveClicked()');

    try {
      await this.saveJsonConfig();
      this.messageWithAutoClear.emit({severity: 'success', summary: 'Successful', detail: `JSON configuration '${this.loadedJsonConfigName}' has been saved`});
    }
    catch (error) {
      console.error('FreeformJsonUIComponent: onJsonSaveClicked(): caught error saving JSON config:', error);
      return;
    }

  }

  /// END Save JSON ///



  /// Save JSON As ///

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
      const jsonConfig: JSONConfig = {
        name: this.jsonSaveAsConfigName,
        json: this.json
      };
      const res = await this.fetcherService.saveNewFreeformJSONConfiguration(jsonConfig);
      this.loadedJsonConfigId = res.id;
      this.messageWithAutoClear.emit({severity: 'success', summary: 'Successful', detail: `JSON configuration '${this.jsonSaveAsConfigName}' has been saved`});
      this.loadedJsonConfigName = this.jsonSaveAsConfigName;
      this.jsonSaveAsConfigName = '';
    }
    catch (error) {
      console.error('FreeformJsonUIComponent: onJsonSaveAsAccepted(): caught error saving JSON config:', error);
      return;
    }

    // Update Fields Configurations
    this.freeformJsonConfigurationsChanged.emit();
    this.showJsonSaveAsDialog = false;
  }



  onJsonSaveAsCancelled() {
    console.log('FreeformJsonUIComponent: onJsonSaveAsCancelled()');
    this.showJsonSaveAsDialog = false;
    this.incidentSaveAsConfigName = '';
  }

  /// End Save JSON As ///



  /// Delete JSON Config ///

  onJsonDeleteConfigClicked() {
    console.log('FreeformJsonUIComponent: onJsonDeleteConfigClicked()');
    this.showDeleteJsonConfigDialog = true;
    this.selectedDeleteJsonConfigIds = [];
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      (document.getElementsByClassName('deleteConfigDialog')[0].getElementsByClassName('p-inputtext')[1] as HTMLInputElement).focus();
    }, 200);
  }



  onJsonDeleteConfigCancelled() {
    console.log('FreeformJsonUIComponent: onJsonDeleteConfigCancelled()');
    this.showDeleteJsonConfigDialog = false;
  }



  onJsonDeleteConfigAccepted() {
    console.log('FreeformJsonUIComponent: onJsonDeleteConfigAccepted()');
    this.showDeleteJsonConfigDialog = false;

    const selectedDeleteJsonConfigNames = this.selectedDeleteJsonConfigIds.map(val => `'${this.savedJsonConfigurationsObj[val].name}'`);

    let message = `Are you sure that you would like to delete the JSON configuration${utils.sPlural(selectedDeleteJsonConfigNames)}: ${selectedDeleteJsonConfigNames.join(', ')} ?`;
    if (this.selectedDeleteJsonConfigIds.includes(this.loadedJsonConfigId) ) {
      message = `Are you sure you want to delete the ACTIVE JSON configuration '${this.loadedJsonConfigName}'`;
      if (selectedDeleteJsonConfigNames.length > 1) {
        const i = selectedDeleteJsonConfigNames.indexOf(this.loadedJsonConfigName);
        selectedDeleteJsonConfigNames.splice(i, 1);
        message += `, as well as configuration${utils.sPlural(selectedDeleteJsonConfigNames)} ${selectedDeleteJsonConfigNames.join(', ')}`;
      }
      message += ' ?';
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

    this.selectedDeleteJsonConfigIds.forEach( async configId => {
      const configName = this.savedJsonConfigurationsObj[configId].name;
      try {
        await this.fetcherService.deleteFreeformJSONConfiguration(configId);
        this.freeformJsonConfigurationsChanged.emit();
      }
      catch (error) {
        console.error(`FreeformJsonUIComponent: onJsonDeleteConfigConfirmed(): caught error whilst deleting JSON configuration ${configName}`);
        return;
      }
    });

    if (this.selectedDeleteJsonConfigIds.includes(this.loadedJsonConfigId)) {
      this.loadedJsonConfigName = undefined;
      this.loadedJsonConfigId = undefined;
      this.defaultJsonConfigId = undefined;
      this.defaultJsonConfigName = undefined;
    }

    const deletedConfigNames = this.selectedDeleteJsonConfigIds.map( id => `'${this.savedJsonConfigurationsObj[id].name}'`);

    this.messageWithAutoClear.emit({severity: 'success', summary: 'Successful', detail: `Configuration${utils.sPlural(deletedConfigNames)} ${deletedConfigNames.join(', ')} ${utils.werePlural(deletedConfigNames)} successfully deleted`});

    this.selectedDeleteJsonConfigIds = []; // reset selection
  }


  /// End Delete JSON Config ///



  /// Create Incident from Raw JSON ///

  onCreateIncidentFromRawJsonClicked() {
    this.showCreateIncidentFromJsonDialog = true;
  }



  async onCreateIncidentFromRawJson() {
    // console.log('FreeformJsonUIComponent: onCreateIncidentFromJson()');

    this.messagesReplace.emit([]);

    for (const endpoint of this.selectedRawJsonCreationEndpoints) {
      const incident: any = {
        serverId: endpoint,
        json: this.json
      };

      console.log('FreeformJsonUIComponent: onCreateIncidentFromJson(): incident:', incident);

      const res = await this.fetcherService.createDemistoIncidentFromJson(incident);
      // console.log('FreeformJsonUIComponent: onCreateIncidentFromJson(): res:', res);

      if (!res.success) {
        const resultMessage = `Incident creation failed on '${endpoint}' with XSOAR status code ${res.statusCode}: "${res.statusMessage}"`;
        this.messageAdd.emit( { severity: 'error', summary: 'Failure', detail: resultMessage} );
      }
      else {
        const incidentId = res.id;
        this.showIncidentCreatedDialog = true;
        this.showIncidentJsonInCreateResults = false;
        this.incidentCreatedId = incidentId;
      }

    }
    this.showCreateIncidentFromJsonDialog = false;
    this.selectedRawJsonCreationEndpoints = [];
  }



  onCreateIncidentFromRawJsonCancelled() {
    this.showCreateIncidentFromJsonDialog = false;
  }

  /// End Create Incident from Raw JSON ///



  /// Set the default JSON Config for Incident Button ///

  async onSetDefaultIncidentJsonFile(unset = false) {
    console.log('FreeformJsonUIComponent: onSetDefaultIncidentJsonFile()');
    if (!unset) {
      try {
        await this.fetcherService.setDefaultIncidentJsonFile(this.loadedIncidentConfigId, this.loadedJsonConfigId);
        this.defaultJsonConfigId = this.loadedJsonConfigId;
        this.defaultJsonConfigName = this.loadedJsonConfigName;
        this.savedIncidentConfigurationsChanged.emit(this.loadedIncidentConfigId);
      }
      catch (error) {
        console.error(`FreeformJsonUIComponent: onSetDefaultIncidentJsonFile(): Caught error setting default JSON file for incident config ${this.loadedIncidentConfigId}:`, error);
      }
    }
    else {
      try {
        await this.fetcherService.clearDefaultIncidentJsonFile(this.loadedIncidentConfigId);
        this.defaultJsonConfigId = undefined;
        this.defaultJsonConfigName = undefined;
        this.savedIncidentConfigurationsChanged.emit(this.loadedIncidentConfigId);
      }
      catch (error) {
        console.error(`FreeformJsonUIComponent: onSetDefaultIncidentJsonFile(): Caught error clearing default JSON file for incident config ${this.loadedIncidentConfigId}:`, error);
      }
    }
  }

  /// End Set the Default JSON Config for Incident Button ///



  /// Open Incident Config ///

  async onIncidentConfigOpened(selectedConfig: IncidentConfig) {
    console.log('FreeformJsonUIComponent: onIncidentConfigOpened()');
    // console.log('FreeformJsonUIComponent: onIncidentConfigOpened(): json:', this.json);
    this.buildChosenFieldsFromConfig(selectedConfig);
    this.buildIncidentFieldOptions(selectedConfig.incidentType);
    this.createInvestigation = selectedConfig.createInvestigation;
    this.selectedIncidentType = selectedConfig.incidentType;
    this.setSelectedIncidentTypeIsAvailable();

    // json group
    const defaultJsonGroupId = selectedConfig.hasOwnProperty('defaultJsonGroupId') ? selectedConfig.defaultJsonGroupId : undefined;
    this.defaultJsonGroupId = undefined;
    this.defaultJsonGroupName = undefined;
    if (defaultJsonGroupId) {
      this.defaultJsonGroupId = defaultJsonGroupId;
      this.defaultJsonGroupName = this.jsonGroupConfigurations[defaultJsonGroupId].name;
    }

    // json file
    const defaultJsonId = selectedConfig.hasOwnProperty('defaultJsonId') ? selectedConfig.defaultJsonId : undefined;
    this.defaultJsonConfigId = undefined;
    this.defaultJsonConfigName = undefined;
    if (defaultJsonId) {
      this.defaultJsonConfigId = defaultJsonId;
      this.defaultJsonConfigName = this.savedJsonConfigurationsObj[defaultJsonId].name;
    }

    this.incidentJson = undefined;

    if (!this.fetchedIncidentTypeNames.includes(selectedConfig.incidentType)) {
      this.updateChosenFieldLocks();
    }

    if (defaultJsonId) {
      try {
        await this.getJsonConfig(defaultJsonId);
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
    else {
      this.json = undefined;
      this.loadedJsonConfigId = undefined;
      this.loadedJsonConfigName = undefined;
    }
  }

  /// End Open Incident Config ///



  /// Rename Incident Config ///

  onRenameIncidentConfigClicked() {
    console.log('FreeformJsonUIComponent: onRenameIncidentConfigClicked()');
    this.renameIncidentConfigName = this.loadedIncidentConfigName;
    this.showRenameIncidentConfigDialog = true;
    setTimeout( () =>
      document.getElementsByClassName('renameIncidentConfigDialog')[0].getElementsByTagName('input')[0].focus()
      , 100);
  }



  async onRenameIncidentConfigAccepted() {
    console.log('FreeformJsonUIComponent: onRenameIncidentConfigAccepted()');
    this.loadedIncidentConfigName = this.renameIncidentConfigName;
    this.showRenameIncidentConfigDialog = false;
    const incidentConfig = this.buildSavedIncidentConfig();
    await this.fetcherService.saveUpdatedIncidentConfiguration(incidentConfig);
    this.savedIncidentConfigurationsChanged.emit();
  }

  /// End Rename Incident Config ///





  /// Import Incident From XSOAR ///

  async onIncidentLoadedFromDemisto(importResult: DemistoIncidentImportResult, demistoIncidentIdToLoad: string, demistoEndpointName: string) {
    console.log('FreeformJsonUIComponent: onIncidentLoadedFromDemisto()');

    this.json = importResult.incident;
    this.incidentJson = undefined;
    const incidentType = 'type' in importResult.incident ? importResult.incident.type : undefined;
    this.buildChosenFieldsFromDemisto(this.json);
    // console.log('FreeformJsonUIComponent: onIncidentLoadedFromDemisto(): chosenIncidentFields1:', this.chosenIncidentFields);
    this.buildIncidentFieldOptions(incidentType);
    // console.log('FreeformJsonUIComponent: onIncidentLoadedFromDemisto(): chosenIncidentFields2:', this.chosenIncidentFields);
    this.messageWithAutoClear.emit( { severity: 'success', summary: 'Success', detail: `Incident ${demistoIncidentIdToLoad} was successfully loaded from '${demistoEndpointName}'`} );
    this.loadedIncidentConfigId = undefined;
    this.loadedIncidentConfigName = undefined;
    this.createInvestigation = true;
    this.loadedJsonConfigId = undefined;
    this.loadedJsonConfigName = undefined;
    this.defaultJsonConfigId = undefined;
    this.defaultJsonConfigName = undefined;
    this.defaultJsonGroupId = undefined;
    this.defaultJsonGroupName = undefined;

    this.selectedIncidentType = incidentType;
    this.setSelectedIncidentTypeIsAvailable();

    console.log('FreeformJsonUIComponent: onIncidentLoadedFromDemisto(): chosenIncidentFields3:', this.chosenIncidentFields);
  }

  /// End Import Incident From XSOAR ///



  /// Upload Incident JSON ///

  onUploadIncidentJson(json: object) {
    this.json = json;
    this.incidentJson = undefined;
    this.buildChosenFieldsFromDemisto(json);
    this.buildIncidentFieldOptions((json as any).type);
    this.selectedIncidentType = (json as any).type;
    this.setSelectedIncidentTypeIsAvailable();
    this.createInvestigation = true;
    this.defaultJsonConfigId = undefined;
    this.defaultJsonConfigName = undefined;
    this.defaultJsonGroupId = undefined;
    this.defaultJsonGroupName = undefined;
  }

  /// End Upload Incident JSON ///





  /// Incident Save & Export ///

  buildSavedIncidentConfig(): IncidentConfig {
    const incidentConfig: IncidentConfig = {
      name: this.loadedIncidentConfigName,
      id: this.loadedIncidentConfigId,
      chosenFields: this.buildSavedFieldConfig(this.chosenIncidentFields),
      createInvestigation: this.createInvestigation,
      incidentType: this.selectedIncidentType
    };
    if (this.defaultJsonConfigName) {
      incidentConfig.defaultJsonId = this.defaultJsonConfigId;
    }
    return incidentConfig;
  }



  async onIncidentSaveClicked() {
    // console.log('FreeformJsonUIComponent(): onIncidentSaveClicked()');
    const incidentConfig = this.buildSavedIncidentConfig();
    console.log('FreeformJsonUIComponent: onIncidentSaveClicked(): incidentConfig:', incidentConfig);
    try {
      await this.fetcherService.saveUpdatedIncidentConfiguration(incidentConfig);
      this.messageWithAutoClear.emit({severity: 'success', summary: 'Successful', detail: `Configuration '${this.loadedIncidentConfigName}' has been saved`});
      this.savedIncidentConfigurationsChanged.emit();
    }
    catch (error) {
      console.error('FreeformJsonUIComponent: onIncidentSaveClicked(): caught error saving field config:', error);
      return;
    }
  }



  async onIncidentExportClicked() {
    // console.log('FreeformJsonUIComponent(): onIncidentExportClicked()');
    const incidentConfig = this.buildSavedIncidentConfig();
    console.log('FreeformJsonUIComponent: onIncidentExportClicked(): incidentConfig:', incidentConfig);
    const filename = this.loadedIncidentConfigName !== undefined ? `${this.loadedIncidentConfigName}_incident_mapping_config.json` : `unsaved_incident_mapping_config.json`;
    this.fetcherService.downloadJSONFile(incidentConfig, filename);
  }

  /// End Incident Save & Export ///



  /// Incident Save As ///

  onIncidentSaveAsClicked() {
    console.log('FreeformJsonUIComponent: onIncidentSaveAsClicked()');
    this.showIncidentSaveAsDialog = true;
    setTimeout( () => {
      // focus input element
      // cannot use ViewChild due to way modal is inserted into the DOM
      document.getElementsByClassName('saveAsDialog')[0].getElementsByTagName('input')[0].focus();
    }, 100);
  }



  async onIncidentSaveAsAccepted() {
    console.log('FreeformJsonUIComponent: onIncidentSaveAsAccepted()');

    let newIncidentConfigId: string;

    const incidentConfig: IncidentConfig = {
      name: this.incidentSaveAsConfigName,
      chosenFields: this.buildSavedFieldConfig(this.chosenIncidentFields),
      createInvestigation: this.createInvestigation,
      incidentType: this.selectedIncidentType
    };
    if (this.defaultJsonConfigId) {
      incidentConfig.defaultJsonId = this.defaultJsonConfigId;
    }
    try {
      const res = await this.fetcherService.saveNewIncidentConfiguration(incidentConfig);
      newIncidentConfigId = res.id;
      this.messageWithAutoClear.emit({severity: 'success', summary: 'Successful', detail: `Configuration '${this.incidentSaveAsConfigName}' has been saved`});
      this.incidentSaveAsConfigName = '';
    }
    catch (error) {
      console.error('FreeformJsonUIComponent: onIncidentSaveAsAccepted(): caught error saving field config:', error);
      return;
    }

    // Update Fields Configurations
    this.savedIncidentConfigurationsChanged.emit(newIncidentConfigId);
    this.showIncidentSaveAsDialog = false;
  }



  onIncidentSaveAsCancelled() {
    console.log('FreeformJsonUIComponent: onIncidentSaveAsCancelled()');
    this.showIncidentSaveAsDialog = false;
    this.incidentSaveAsConfigName = '';
  }

  /// End Incident Save As ///



  /// Incident Created Dialog ///

  async onClickDemistoInvestigateUrl(incidentId: number, version) {
    console.log('FreeformJsonUIComponent: onClickDemistoInvestigateUrl(): id:', incidentId);
    const serverId = this.currentDemistoEndpointId;
    const result = await this.fetcherService.createInvestigation(incidentId, serverId, version);
    if (result.success) {
      const url = `${this.demistoEndpoints[serverId].url}/#/incident/${incidentId}`;
      window.open(url, '_blank');
    }
    else if ('error' in result) {
      console.error(`FreeformJsonUIComponent: onClickDemistoInvestigateUrl(): XSOAR threw error when opening investigation ${incidentId} on ${serverId}:`, result.error);
    }
  }



  onViewIncidentJSONClicked(incidentId: number, serverId: string) {
    console.log('FreeformJsonUIComponent: onViewIncidentJSONClicked()');

    const config: DynamicDialogConfig = {
      header: `JSON of XSOAR Incident ${incidentId} on '${this.demistoEndpoints[serverId].url}'`,
      closable: true,
      closeOnEscape: true,
      data: {
        value: this.incidentJson,
        readOnly: true,
        showResetValues: false
      },
      width: '95%',
      height: '90%'
    };
    const dialogRef = this.dialogService.open(JsonEditorComponent, config);
  }



  onDownloadIncidentJSONClicked(incidentId: number) {
    console.log('FreeformJsonUIComponent: onDownloadIncidentJSONClicked()');

    this.fetcherService.downloadJSONFile(this.incidentJson, `xsoar_incident_${incidentId}.json`);
  }

  /// End Incident Created Dialog ///



  /// JSON Defaults Dialog ///

  onJsonDefaultsClicked() {
    console.log('FreeformJsonUIComponent: onJsonDefaultsClicked()');
    this.showDefaultJsonDialog = true;

    this.defaultJsonDialog_selectedJsonId = this.defaultJsonConfigId ? this.defaultJsonConfigId : undefined;

    this.defaultJsonDialog_selectedJsonGroupId = this.defaultJsonGroupId ? this.defaultJsonGroupId : undefined;
  }



  onJsonDefaultsCanceled() {
    console.log('FreeformJsonUIComponent: onJsonDefaultsCanceled()');
    this.showDefaultJsonDialog = false;
  }



  async onJsonDefaultsAccepted() {
    console.log('FreeformJsonUIComponent: onJsonDefaultsAccepted()');
    console.log('FreeformJsonUIComponent: defaultJsonDialog_selectedJsonId:', this.defaultJsonDialog_selectedJsonId);
    this.showDefaultJsonDialog = false;
    let incidentConfigChanged = false;

    // JSON File
    const defaultJsonIsSame = this.defaultJsonConfigId && this.defaultJsonConfigId === this.defaultJsonDialog_selectedJsonId;
    const updateDefaultJson = !defaultJsonIsSame && this.defaultJsonDialog_selectedJsonId;
    const clearDefaultJson = this.defaultJsonConfigId && !this.defaultJsonDialog_selectedJsonId;
    if (updateDefaultJson) {
      await this.fetcherService.setDefaultIncidentJsonFile(this.loadedIncidentConfigId, this.defaultJsonDialog_selectedJsonId);
      this.defaultJsonConfigId = this.defaultJsonDialog_selectedJsonId;
      this.defaultJsonConfigName = this.savedJsonConfigurationsObj[this.defaultJsonConfigId].name;
      incidentConfigChanged = true;
    }
    else if (clearDefaultJson) {
      await this.fetcherService.clearDefaultIncidentJsonFile(this.loadedIncidentConfigId);
      this.defaultJsonConfigId = undefined;
      this.defaultJsonConfigName = undefined;
      incidentConfigChanged = true;
    }

    // JSON Group
    console.log('FreeformJsonUIComponent: defaultJsonDialog_selectedJsonGroupId:', this.defaultJsonDialog_selectedJsonGroupId);
    const defaultJsonGroupIsSame = this.defaultJsonGroupId && this.defaultJsonGroupId === this.defaultJsonDialog_selectedJsonGroupId;
    const updateDefaultJsonGroup = !defaultJsonGroupIsSame && this.defaultJsonDialog_selectedJsonGroupId;
    const clearDefaultJsonGroup = this.defaultJsonGroupId && !this.defaultJsonDialog_selectedJsonGroupId;
    if (updateDefaultJsonGroup) {
      await this.fetcherService.setDefaultIncidentJsonGroup(this.loadedIncidentConfigId, this.defaultJsonDialog_selectedJsonGroupId);
      this.defaultJsonGroupId = this.defaultJsonDialog_selectedJsonGroupId;
      this.defaultJsonGroupName = this.jsonGroupConfigurations[this.defaultJsonGroupId].name;
      incidentConfigChanged = true;
    }
    else if (clearDefaultJsonGroup) {
      await this.fetcherService.clearDefaultIncidentJsonGroup(this.loadedIncidentConfigId);
      this.defaultJsonGroupId = undefined;
      this.defaultJsonGroupName = undefined;
      incidentConfigChanged = true;
    }

    if (incidentConfigChanged) {
      this.savedIncidentConfigurationsChanged.emit();
    }
  }

  /// End JSON Defaults Dialog ///



  /// Rename JSON File ///

  onRenameJsonFileClicked() {
    console.log('FreeformJsonUIComponent: onRenameJsonFileClicked()');
    this.renameJsonFileName = this.loadedJsonConfigName;
    this.showRenameJsonFileDialog = true;
    setTimeout( () =>
      document.getElementsByClassName('renameJsonFileConfigDialog')[0].getElementsByTagName('input')[0].focus()
      , 100);
  }



  async onRenameJsonFileAccepted() {
    console.log('loadedJsonConfigName: onRenameJsonFileAccepted()');
    this.loadedJsonConfigName = this.renameJsonFileName;
    this.showRenameJsonFileDialog = false;
    try {
      await this.saveJsonConfig();
    }
    catch (error) {
      console.error('FreeformJsonUIComponent: onRenameJsonFileAccepted(): caught error saving JSON config:', error);
      return;
    }
    this.freeformJsonConfigurationsChanged.emit();
  }

  /// End Rename JSON File ///

}
