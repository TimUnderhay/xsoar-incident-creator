import { Component, OnInit, OnChanges, OnDestroy, Input, Output, EventEmitter, SimpleChanges } from '@angular/core';
import { IncidentField } from './types/incident-fields';
import { SelectItem } from 'primeng/api';
import { DialogService, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { JsonEditorComponent } from './json-editor/json-editor.component';
import { Subscription } from 'rxjs';

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'incident-field-row', // field-display
  templateUrl: './incident-field-row.component.html',
  providers: [ DialogService ]
})

export class IncidentFieldRowComponent implements OnInit, OnChanges, OnDestroy {

  constructor(public dialogService: DialogService) {}

  @Input() field: IncidentField;
  @Input() displayShortNames: boolean;
  @Output() fieldChange = new EventEmitter();

  detectedFieldType: string;
  boolOptions: SelectItem[] = [
    { value: true, label: 'True' },
    { value: false, label: 'False' }
  ];
  dateFieldValue: Date;
  resetValueTooltip = 'Resets the value';
  private subscriptions = new Subscription();


  ngOnInit() {
    // console.log('IncidentFieldRowComponent: ngOnInit(): field:', this.field);
  }



  ngOnChanges(values: SimpleChanges) {
    // console.log('IncidentFieldRowComponent: ngOnChanges(): values:', values);

    const updateFieldType = 'field' in values && (values.field.isFirstChange() || values.field.currentValue !== values.field.previousValue);

    if (updateFieldType && this.field.fieldType === 'undefined') {
      this.detectedFieldType = this.identifyType(this.field.value);
    }

    else if (updateFieldType && this.field.fieldType === 'date') {
      this.dateFieldValue = new Date(this.field.value);
    }

    if (this.field && this.field.fieldType === 'multiSelect') {
      console.log(`IncidentFieldRowComponent: ngOnChanges(): ${this.field.shortName}:`, this.field.value);
    }
  }



  ngOnDestroy() {
    // console.log('I got destroyed!');
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



  onSelectionChanged(value) {
    // console.log('IncidentFieldRowComponent: onSelectionChanged(): value:', value);
    this.field.enabled = value;
    this.fieldChange.emit(this.field);
  }




  onValueChanged(value) {
    // console.log('IncidentFieldRowComponent: onValueChanged(): value:', value);
    this.fieldChange.emit(this.field);
  }



  onDateChanged() {
    this.field.value = this.dateFieldValue.toISOString();
    this.fieldChange.emit(this.field);
  }



  onResetValue(custom: boolean = null) {
    if (custom !== null && custom !== this.field.custom) {
      return;
    }
    if (this.field.value === this.field.originalValue) {
      return;
    }
    if ('fieldType' in this.field && this.field.fieldType === 'date') {
      this.dateFieldValue = new Date(this.field.originalValue);
    }
    this.field.value = this.field.originalValue;
    this.fieldChange.emit(this.field);
  }



  onDialogClosed(value) {
    console.log('onDialogClosed(): value:', value);
    if (value !== undefined) {
      this.field.value = value;
      this.fieldChange.emit(this.field);
    }
  }



  onEditJSON() {
    console.log('onEditJSON()');
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
