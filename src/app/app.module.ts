import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

// Components
import { AppComponent } from './app.component';
import { FieldDisplayComponent } from './field-display.component';
import { JsonEditorComponent } from './json-editor/json-editor.component';
import { JsonViewerComponent } from './json-viewer/json-viewer.component';
import { IncidentFieldsUIComponent } from './incident-fields-ui.component';
// import { FreeformJsonUIComponent } from './freeform-json-ui.component';
import { JsonMappingUIComponent } from './json-mapping.component';

// PrimeNG Imports
import { ListboxModule } from 'primeng/listbox';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { MessagesModule } from 'primeng/messages';
import { MessageModule } from 'primeng/message';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { CalendarModule } from 'primeng/calendar';
import { RadioButtonModule } from 'primeng/radiobutton';
import { FileUploadModule } from 'primeng/fileupload';
import { SelectButtonModule } from 'primeng/selectbutton';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { TooltipModule } from 'primeng/tooltip';
import { DynamicDialogModule } from 'primeng/dynamicdialog';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';

// Other 3rd-party Modules
import { AceEditorModule } from 'ng2-ace-editor';

@NgModule({
  declarations: [
    AppComponent,
    FieldDisplayComponent,
    JsonEditorComponent,
    JsonViewerComponent,
    IncidentFieldsUIComponent,
    JsonMappingUIComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    FormsModule,
    ListboxModule,
    CardModule,
    ButtonModule,
    MessagesModule,
    MessageModule,
    InputSwitchModule,
    InputTextModule,
    DropdownModule,
    CalendarModule,
    RadioButtonModule,
    FileUploadModule,
    SelectButtonModule,
    CheckboxModule,
    InputTextareaModule,
    ToggleButtonModule,
    TooltipModule,
    DynamicDialogModule,
    DialogModule,
    ConfirmDialogModule,
    AceEditorModule
  ],
  entryComponents: [
    JsonEditorComponent
  ],
  providers: [ ConfirmationService ],
  bootstrap: [ AppComponent ]
})
export class AppModule { }

