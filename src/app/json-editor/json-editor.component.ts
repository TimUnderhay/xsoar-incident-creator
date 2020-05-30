import { Component, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';

@Component({
  selector: 'json-editor',
  templateUrl: './json-editor.component.html'
})

export class JsonEditorComponent implements OnInit, AfterViewInit {

  constructor(
    public dialogRef: DynamicDialogRef,
    public dialogConfig: DynamicDialogConfig) {}

  @ViewChild('aceEditor') aceEditorComponentRef;

  originalValue: any;
  stringValue: string;
  parsedValue: any;
  canSubmit = true;
  readOnly = false;
  showResetValues = true;

  aceEditorOptions = {
    useSoftTabs: false,
    tabSize: 4,
    wrapBehavioursEnabled: true,
    wrap: true
  };

  ngOnInit() {
    console.log('JsonEditorComponent: ngOnInit()');
    this.originalValue = this.dialogConfig.data.value;
    try {
      this.stringValue = JSON.stringify(this.originalValue, null, 4);
      this.parsedValue = this.originalValue;
    }
    catch (error) {
      this.stringValue = 'Error parsing JSON data: ' + error;
    }
    this.showResetValues = 'showResetValues' in this.dialogConfig.data ? this.dialogConfig.data.showResetValues : true;
    this.readOnly = this.dialogConfig.data.readOnly;
  }



  ngAfterViewInit() {
    this.aceEditorComponentRef.getEditor().commands.removeCommand('find'); // disables ctrl-f hooking
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
