import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { IncidentField, CustomField } from './types/incident-fields';
import { SelectItem } from 'primeng/api';
import { DialogService, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { JsonEditorComponent } from './json-editor.component';
import { Subscription } from 'rxjs';

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'field-display',
  templateUrl: './field-display.component.html',
  providers: [ DialogService ]
})

export class FieldDisplayComponent implements OnInit, OnDestroy {

  constructor(public dialogService: DialogService) {}

  @Input() field: IncidentField | CustomField;
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
    console.log('FieldDisplayComponent: ngOnInit(): field:', this.field);

    if (this.field.fieldType === 'undefined') {
      this.detectedFieldType = this.identifyType(this.field.value);
      // console.log(`FieldDisplayComponent: ngOnInit(): detectedFieldType: ${this.field.shortName}: ${this.detectedFieldType}` );
    }

    if ('fieldType' in this.field && this.field.fieldType === 'date') {
      this.dateFieldValue = new Date(this.field.value);
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
    // console.log('FieldDisplayComponent: onSelectionChanged(): value:', value);
    this.field.enabled = value;
    this.fieldChange.emit(this.field);
  }




  onValueChanged(value) {
    // console.log('FieldDisplayComponent: onValueChanged(): value:', value);
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
