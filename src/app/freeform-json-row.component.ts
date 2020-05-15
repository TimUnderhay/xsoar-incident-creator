import { Component, OnInit, OnChanges, OnDestroy, Input, Output, EventEmitter, SimpleChanges } from '@angular/core';
import { IncidentField, DatePrecision, DateConfig } from './types/incident-fields';
import { SelectItem, ConfirmationService } from 'primeng/api';
import { DialogService, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { JsonEditorComponent } from './json-editor/json-editor.component';
import { Subscription } from 'rxjs';
import { FetcherService, FieldMappingSelection } from './fetcher-service';
import * as utils from './utils';
import { Segment } from './ngx-json-viewer/ngx-json-viewer.component';
import * as Moment from 'moment';
declare var jmespath: any;

const defaultDateConfig = {
  autoParse: true,
  formatter: '',
  precision: 1,
  utcOffsetEnabled: false,
  utcOffset: 0
};

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

  get dateConfig(): DateConfig {
    return 'dateConfig' in this.field ? this.field.dateConfig : undefined;
  }
  set dateConfig(value: DateConfig) {
    this.field.dateConfig = value;
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
  datePrecisionItems: SelectItem[] = [
    { value: 1, 'label': 'Seconds' },
    { value: 1000, 'label': 'Milliseconds' },
    { value: 1000000, 'label': 'Microseconds' },
    { value: 1000000000, 'label': 'Nanoseconds' }
  ]
  
  
  valueType: string; // The js type of the value or resolved value.  Controls how field's value is displayed in the UI, i.e whether to display raw value or put "View JSON" or "Edit JSON"
  dateFieldValue: Date;
  // mappingMethodValue: MappingMethod = 'static';
  selectValueHovering = false;
  resetValueHovering = false;

  _resolvedValue: any;
  get resolvedValue() : any {
    return this._resolvedValue;
  }
  set resolvedValue(value: any) {
    this._resolvedValue = value;
    this.resolvedValueType = typeof value;
  }
  resolvedValueType: string;
  jmesPathResolveError: string;
  transformedValue: any;


  // Date Transformations
  dateAutoParse = true;
  enableUtcOffset = false;
  _dateUtcOffset = 0;
  get dateUtcOffset(): number {
    return this._dateUtcOffset;
  }
  set dateUtcOffset(value) {
     this._dateUtcOffset = [null, undefined, ''].includes(value as any) ? 0 : value;
  }

  dateFormatter = '';
  selectedDatePrecision = 1;
  dateTransformError = false;


  
  // UI State
  showDateTransformOptions = false;
  selectionModeActive = false;



  ngOnInit() {
    // console.log('FreeformJsonRowComponent: ngOnInit(): field:', this.field);
    this.subscriptions.add( this.fetcherService.fieldMappingSelectionActive.subscribe( (fieldMappingSelection: FieldMappingSelection) => this.onFieldMappingSelectionActive(fieldMappingSelection) ));

    this.subscriptions.add( this.fetcherService.fieldMappingSelectionReceived.subscribe( (segment: Segment) => this.onFieldMappingSelectionReceived(segment) ));

    this.subscriptions.add( this.fetcherService.fieldMappingSelectionEnded.subscribe( () => this.onFieldMappingSelectionEnded() ));
  }



  ngOnChanges(values: SimpleChanges) {
    // console.log('FreeformJsonRowComponent: ngOnChanges(): values:', values);
    const fieldFirstOrChanged = utils.firstOrChangedSimpleChange('field', values);
    const fieldFirst = utils.firstSimpleChange('field', values);

    if (fieldFirst && this.field.mappingMethod === 'jmespath' && this.field.fieldType === 'date' && !('dateConfig' in this.field)) {
      // add dateConfig to date field, if not already present
      this.dateConfig = defaultDateConfig;
    }
    
    if (this.field.mappingMethod === 'static') {

      if (fieldFirstOrChanged && this.field.fieldType === 'undefined') {
        this.valueType = this.identifyType(this.field.value);
      }
  
      else if (fieldFirstOrChanged && this.field.fieldType === 'date') {
        this.dateFieldValue = new Date(this.field.value);
      }

    }

    const jsonFirstOrChanged = utils.firstOrChangedSimpleChange('json', values);
    const useJMESPath = this.field && this.field.mappingMethod === 'jmespath' && this.field.jmesPath !== '';
    if (this.json && useJMESPath && (jsonFirstOrChanged || fieldFirstOrChanged)) {
      const resolveDate = this.field.fieldType === 'date';
      this.jmesPathResolve(this.field.jmesPath, resolveDate);
    }
    
  }


  ngOnDestroy() {
    console.log('FreeformJsonRowComponent: ngOnDestroy():', this.field.shortName);
    this.subscriptions.unsubscribe();
  }



  identifyType(value): string {
    console.log('FreeformJsonRowComponent: identifyType(): value:', value);
    let valType: any = typeof value;
    return valType;
  }



  onValueChanged(value) {
    // console.log('FreeformJsonRowComponent: onValueChanged(): value:', value);
    // this.fieldChange.emit(this.field);
  }



  onEnabledSelectionChanged(value) {
    console.log('FreeformJsonRowComponent: onEnabledSelectionChanged(): value:', value);
    this.enabled = value;
  }



  onDateChanged() {
    this.value = this.dateFieldValue.toISOString();
  }



  onResetValueClicked(custom: boolean = null) {
    if (this.field.shortName === 'type') {
      return;
    }
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



  jmesPathResolve(path, resolveDate=false) {
    // console.log('FreeformJsonRowComponent: jmesPathResolve(): path:', path);

    this.jmesPath = path;

    if (path === '' || path.match(/^\s+$/)) {
      return;
    }
    try {
      let res = jmespath.search(this.json, path);
      res = utils.massageData(res, this.field.fieldType);
      this.jmesPathResolveError = undefined;
      if (res === null) {
        this.resolvedValue = 'null';
        return;
      }
      this.resolvedValue = res;
      this.valueType = this.identifyType(this.resolvedValue);

      if (resolveDate) {
        this.transformDate(false);
      }
    }
    catch(error) {
      // console.error(error);
      if (error.name === 'ParserError') {
        console.log('FreeformJsonRowComponent: jmesPathResolve(): JMESPath.search error:', 'message' in error ? error.message : error);
        this.jmesPathResolveError = error.message;
        this.resolvedValue = 'null';
     }
     else {
       console.error('FreeformJsonRowComponent: jmesPathResolve(): JMESPath.search error:', error);
     }
    }
  }



  transformDate(useUIValues=false): string {
    console.log('FreeformJsonRowComponent: transformDate(): resolvedValue:', this.resolvedValue);
    
    if (!this.resolvedValue || this.resolvedValue === '') {
      return;
    }

    let value = this.resolvedValue;

    let valueType = typeof value;

    let moment: Moment.Moment;

    const dateConfig: DateConfig = !useUIValues ? this.field.dateConfig : {
      autoParse: this.dateAutoParse,
      formatter: this.dateFormatter,
      precision: this.selectedDatePrecision,
      utcOffsetEnabled: this.enableUtcOffset,
      utcOffset: this.dateUtcOffset
    };

    if (valueType === 'number') {
      moment = dateConfig.precision === 1 ? Moment.unix(value).utc() : Moment(value / dateConfig.precision * 1000).utc();
    }

    else if (valueType === 'string') {
      moment = dateConfig.autoParse ? Moment(value) : Moment(value, dateConfig.formatter);
    }

    const valid = moment.isValid();

    if (valid && dateConfig.utcOffsetEnabled) {
      moment.add(dateConfig.utcOffset, 'hours');
    }

    if (useUIValues) {
      // toISOString() returns null if there's a problem.  We want to see 'Invalid date' instead, which format() will return.
      return valid ? moment.toISOString() : moment.format();
    }

    this.transformedValue = valid ? moment.toISOString() : moment.format();
    this.dateTransformError =  !valid ? true : false;
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
      this.value = utils.massageData(segment.value, this.field.fieldType);
    }
    else if (this.field.mappingMethod === 'jmespath') {
      this.jmesPath = segment.path;
      const resolveDate = this.field.fieldType === 'date';
      this.jmesPathResolve(this.field.jmesPath, resolveDate);
    }
    this.enabled = true;
    this.selectionModeActive = false;
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
      closeOnEscape: true,
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
      closeOnEscape: true,
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



  syncDateUiToDateOptions() {
    const dateConfig = this.dateConfig;

    this.dateAutoParse = 'autoParse' in dateConfig ? dateConfig.autoParse : defaultDateConfig.autoParse;
    this.dateFormatter = 'formatter' in dateConfig ? dateConfig.formatter : defaultDateConfig.formatter;
    this.selectedDatePrecision = 'precision' in dateConfig ? dateConfig.precision : defaultDateConfig.precision;
    this.enableUtcOffset = 'utcOffsetEnabled' in dateConfig ? dateConfig.utcOffsetEnabled : defaultDateConfig.utcOffsetEnabled;
    this.dateUtcOffset = 'utcOffset' in dateConfig ? dateConfig.utcOffset : defaultDateConfig.utcOffset;
  }



  onShowDateTransformOptionsClicked() {
    if (this.resolvedValue === undefined) {
      return;
    }
    this.syncDateUiToDateOptions();
    this.showDateTransformOptions = true;
  }



  onDateTransformOptionsCancelled() {
    this.showDateTransformOptions = false;
  }



  onDateTransformOptionsAccepted() {
    this.showDateTransformOptions = false;

    const newDateConfig: DateConfig = {};

    if (this.resolvedValueType === 'number') {
      newDateConfig.precision = this.selectedDatePrecision;
    }
    else if (this.resolvedValueType === 'string') {
      newDateConfig.autoParse = this.dateAutoParse;  
      if (!newDateConfig.autoParse) {
        newDateConfig.formatter = this.dateFormatter;
      }
    }

    if (this.enableUtcOffset) {
      newDateConfig.utcOffsetEnabled = true;
      newDateConfig.utcOffset = this.dateUtcOffset;
    }

    this.dateConfig = newDateConfig;
    this.transformDate();
  }


}
