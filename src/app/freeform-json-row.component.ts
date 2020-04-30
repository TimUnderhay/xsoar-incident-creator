import { Component, OnInit, OnChanges, OnDestroy, Input, Output, EventEmitter, SimpleChanges } from '@angular/core';
import { IncidentField } from './types/incident-fields';
import { SelectItem, ConfirmationService } from 'primeng/api';
import { DialogService, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { JsonEditorComponent } from './json-editor/json-editor.component';
import { Subscription } from 'rxjs';
import { FetcherService, FieldMappingSelection } from './fetcher-service';
import * as utils from './utils';
import { Segment } from './ngx-json-viewer/ngx-json-viewer.component';
declare var jmespath: any;

export type MappingMethod = 'static' | 'jmespath'; // 'randomised'

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'freeform-json-row',
  templateUrl: './freeform-json-row.component.html',
  providers: [ DialogService ]
})

export class FreeformJsonRowComponent implements OnInit, OnChanges, OnDestroy {

  constructor(
    public dialogService: DialogService,
    private fetcherService: FetcherService, // import our URL fetcher)
    private confirmationService: ConfirmationService) {}

  @Input() field: IncidentField;
  @Output() fieldChange = new EventEmitter<IncidentField>();
  @Output() fieldDeleted = new EventEmitter<string>();
  
  @Input() displayShortNames: boolean;
  @Input() jsonLoaded: boolean;
  @Input() json: Object;
  
  get value() {
    return this.field.value;
  }
  set value(value) {
    this.field.value = value;
    this.fieldChange.emit(this.field);
  }

  get jmesPath() {
    return this.field.jmesPath;
  }
  set jmesPath(value) {
    this.field.jmesPath = value;
    this.fieldChange.emit(this.field);
  }

  get mappingMethod() {
    return this.field.mappingMethod;
  }
  set mappingMethod(value) {
    this.field.mappingMethod = value;
    this.fieldChange.emit(this.field);
  }

  get enabled() {
    return this.field.enabled;
  }
  set enabled(value) {
    this.field.enabled = value;
    this.fieldChange.emit(this.field);
  }



  private subscriptions = new Subscription();


  // PrimeNG
  boolItems: SelectItem[] = [
    { value: true, label: 'True' },
    { value: false, label: 'False' }
  ];
  mappingMethodItems: SelectItem[] = [
    { value: 'static', 'label': 'Static' },
    { value: 'jmespath', 'label': 'JMESPath' },
    // { value: 'randomised', 'label': 'Randomised' }
  ];
  detectedFieldType: string;
  dateFieldValue: Date;
  // mappingMethodValue: MappingMethod = 'static';
  selectValueHovering = false;
  resetValueHovering = false;
  resolvedValue: any;
  jmesPathResolveError: string;

  selectionModeActive = false;



  ngOnInit() {
    // console.log('FreeformJsonRowComponent: ngOnInit(): field:', this.field);
    this.subscriptions.add( this.fetcherService.fieldMappingSelectionActive.subscribe( (fieldMappingSelection: FieldMappingSelection) => this.onFieldMappingSelectionActive(fieldMappingSelection) ));

    this.subscriptions.add( this.fetcherService.fieldMappingSelectionReceived.subscribe( (segment: Segment) => this.onFieldMappingSelectionReceived(segment) ));

    this.subscriptions.add( this.fetcherService.fieldMappingSelectionEnded.subscribe( () => this.onFieldMappingSelectionEnded() ));

    
  }



  ngOnChanges(values: SimpleChanges) {
    // console.log('FreeformJsonRowComponent: ngOnChanges(): values:', values);
    const updateFieldType = utils.firstOrChangedSimpleChange('field', values);

    if (updateFieldType && this.field.fieldType === 'undefined') {
      this.detectedFieldType = this.identifyType(this.field.value);
    }

    else if (updateFieldType && this.field.fieldType === 'date') {
      this.dateFieldValue = new Date(this.field.value);
    }

    /*if (this.json && utils.firstOrChangedSimpleChange('field', values) && this.field.mappingMethod === 'jmespath' && this.field.jmesPath !== '') {
      this.jmesPathResolve(this.field.jmesPath);
    }*/
    
  }


  ngOnDestroy() {
    console.log('FreeformJsonRowComponent: ngOnDestroy():', this.field.shortName);
    this.subscriptions.unsubscribe();
  }



  identifyType(value): string {
    let valType: any = typeof value;
    /*switch (valType) {

      case 'object':
        if (Array.isArray(valType)) {
          return 'object';
        }
        if ('runStatus' in this.field.value && 'startDate' in this.field.value && 'endDate' in this.field.value) {
          return 'timer';
        }
        return 'object';
        break;

      default:
        return valType;
    }*/
    /*try {
      const d = new Date(value);
      valType = 'date';
    }
    catch {}*/
    return valType;
  }



  onEnabledSelectionChanged(value) {
    console.log('FreeformJsonRowComponent: onEnabledSelectionChanged(): value:', value);
    this.enabled = value;
  }



  onValueChanged(value) {
    // console.log('FreeformJsonRowComponent: onValueChanged(): value:', value);
    // this.fieldChange.emit(this.field);
  }



  onDateChanged() {
    this.value = this.dateFieldValue.toISOString();
  }



  onResetValueClicked(custom: boolean = null) {
    if (custom !== null && custom !== this.field.custom) {
      return;
    }
    if (this.field.value === this.field.originalValue) {
      return;
    }
    if ('fieldType' in this.field && this.field.fieldType === 'date') {
      this.dateFieldValue = new Date(this.field.originalValue);
    }
    this.value = this.field.originalValue;
    // this.field.value = this.field.originalValue;
    // this.fieldChange.emit(this.field);
  }



  onDeleteFieldClicked() {
    console.log(`FreeformJsonRowComponent: onDeleteFieldClicked(): field: ${this.field.shortName}`);
    this.confirmationService.confirm({
      message: `Are you sure you want to delete field ${this.field.shortName}?`,
      accept: () => this.onDeleteFieldConfirmed(),
      icon: 'pi pi-exclamation-triangle'
    })
  }



  onDeleteFieldConfirmed() {
    console.log(`FreeformJsonRowComponent: onDeleteFieldConfirmed(): field: ${this.field.shortName}`);
    this.fieldDeleted.emit(this.field.shortName);
  }



  onStaticSelectValueFromJsonClicked() {
    if (!this.jsonLoaded) {
      return;
    }
    console.log(`FreeformJsonRowComponent: onStaticSelectValueFromJsonClicked(): field: ${this.field.shortName}`);
    this.fetcherService.fieldMappingSelectionActive.next({field: this.field, method: 'static'});
  }



  onJMESPathSelectValueFromJsonClicked() {
    if (!this.jsonLoaded) {
      return;
    }
    console.log(`FreeformJsonRowComponent: onJMESPathSelectValueFromJsonClicked(): field: ${this.field.shortName}`);
    this.fetcherService.fieldMappingSelectionActive.next({field: this.field, method: 'jmespath'});
  }



  massageData(value) {
    switch(this.field.fieldType) {
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
    console.log('FreeformJsonRowComponent: jmesPathResolve()');
    this.jmesPath = path;

    if (path === '' || path.match(/^\s+$/)) {
      return;
    }
    try {
      let res = jmespath.search(this.json, path);
      res = this.massageData(res);
      this.jmesPathResolveError = undefined;
      if (res === null) {
        this.resolvedValue = 'null';
        return;
      }
      this.resolvedValue = res;
      this.detectedFieldType = this.identifyType(this.value);
    }
    catch(error) {
      console.error(error);
      this.jmesPathResolveError = error;
    }
  }



  onFieldMappingSelectionActive(fieldMappingSelection: FieldMappingSelection) {
    const field = fieldMappingSelection.field;
    this.selectionModeActive = field.shortName === this.field.shortName;
    if (this.selectionModeActive) {
      console.log(`FreeformJsonRowComponent: onFieldMappingSelectionActive():`, field.shortName);
    }
  }



  onFieldMappingSelectionEnded() {
    this.selectionModeActive = false;
  }



  onFieldMappingSelectionReceived(segment: Segment) {
    // console.log(`FreeformJsonRowComponent: onFieldMappingSelectionReceived(): segment:`, segment);
    if (!this.selectionModeActive) {
      return;
    }
    if (this.field.mappingMethod === 'static') {
      this.value = this.massageData(segment.value);
    }
    else if (this.field.mappingMethod === 'jmespath') {
      this.jmesPath = segment.path;
      this.jmesPathResolve(this.field.jmesPath);
    }
    this.enabled = true;
    this.selectionModeActive = false;
    // this.fetcherService.fieldMappingSelectionEnded.next();
  }



  onDialogClosed(value) {
    console.log('FreeformJsonRowComponent: onDialogClosed(): value:', value);
    if (value !== undefined) {
      this.value = value;
    }
  }



  onViewJSONClicked(value) {
    console.log('FreeformJsonRowComponent: onViewJSON()');
    let config: DynamicDialogConfig = {
      header: `JSON viewer for field '${this.field.shortName}'`,
      closable: true,
      data: {
        value,
        readOnly: true
      },
      width: '95%',
      height: '90%'
    };
    let dialogRef = this.dialogService.open(JsonEditorComponent, config);
    dialogRef.onClose.subscribe( value => this.onDialogClosed(value) );
  }



  onEditJSONClicked() {
    console.log('FreeformJsonRowComponent: onEditJSON()');
    let config: DynamicDialogConfig = {
      header: `JSON ${this.field.locked ? 'viewer' : 'editor'} for field '${this.field.shortName}'`,
      closable: true,
      data: {
        value: this.field.value,
        readOnly: this.field.locked
      },
      width: '95%',
      height: '90%'
    };
    let dialogRef = this.dialogService.open(JsonEditorComponent, config);
    dialogRef.onClose.subscribe( value => this.onDialogClosed(value) );
  }


}
