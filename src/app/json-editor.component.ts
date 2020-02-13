import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'json-editor',
  templateUrl: './json-editor.component.html'
})

export class JsonEditorComponent implements OnInit {

  constructor(public dialogRef: DynamicDialogRef, public dialogConfig: DynamicDialogConfig) {}

  originalValue: any;
  stringValue: string;
  parsedValue: any;
  canSubmit = true;
  readOnly = false;

  aceEditorOptions = {
    useSoftTabs: false,
    tabSize: 4,
    wrapBehavioursEnabled: true,
    wrap: true
  };

  ngOnInit() {
    this.originalValue = this.dialogConfig.data.value;
    try {
      this.stringValue = JSON.stringify(this.originalValue, null, 4);
      this.parsedValue = this.originalValue;
    }
    catch (error) {
      this.stringValue = 'Error parsing JSON data: ' + error;
    }
    this.readOnly = this.dialogConfig.data.readOnly;
  }



  onValueChanged(value) {
    try {
      this.parsedValue = JSON.parse(this.stringValue);
      this.canSubmit = true;
    }
    catch {
      this.canSubmit = false;
    }
  }



  onAccept() {
    this.dialogRef.close(this.parsedValue);
  }



  onCancel() {
    this.dialogRef.close();
  }



  resetValues() {
    this.stringValue = JSON.stringify(this.originalValue, null, 4);
    this.parsedValue = this.originalValue;
  }

}
