import { Component, OnInit, Input, ChangeDetectorRef } from '@angular/core';
import { FetcherService } from './fetcher-service';
import { DemistoAPI, DemistoAPIEndpoints } from './types/demisto-properties';
import { ConfirmationService } from 'primeng/api';
import { FetchedIncidentField, FetchedIncidentFieldDefinitions } from './types/fetched-incident-field';
import { IncidentField, IncidentFields } from './types/incident-fields';
import { FetchedIncidentType } from './types/fetched-incident-types';
import { SelectItem } from 'primeng/api';

@Component({
  // tslint:disable-next-line: component-selector
  selector: 'json-mapping-ui',
  templateUrl: './json-mapping.component.html'
})

export class JsonMappingUIComponent implements OnInit {

  constructor(
    private fetcherService: FetcherService, // import our URL fetcher
    private confirmationService: ConfirmationService,
    private changeDetector: ChangeDetectorRef
  ) {}

  @Input() loadedJsonMappingConfigName: string; // must clear when loaded from json or when current config is deleted
  @Input() currentDemistoApiName: string;
  @Input() currentServerApiInit: boolean;
  @Input() fetchedIncidentFieldDefinitions: FetchedIncidentFieldDefinitions; // the fields taken from Demisto
  @Input() fetchedIncidentTypes: FetchedIncidentType[]; // the incident types taken from Demisto

  incidentTypes: string[];

  // PrimeNG
  incidentTypeOptions: SelectItem[];
  selectedIncidentType: string;



  ngOnInit() {
    console.log('ngOnInit(): fetchedIncidentFieldDefinitions:', this.fetchedIncidentFieldDefinitions);

    if (this.fetchedIncidentTypes && this.fetchedIncidentFieldDefinitions) {
      this.buildIncidentTypeOptions();
    }
  }



  buildIncidentTypeOptions() {
    console.log('buildIncidentTypeOptions()');
    let items: SelectItem[] = [];
    for (let incidentType of this.fetchedIncidentTypes) {
      // console.log('buildIncidentTypeOptions(): incidentType:', incidentType);
      const item: SelectItem = { label: incidentType.name, value: incidentType.name };
      items.push(item);
    }
    this.incidentTypeOptions = items;
  }



  onIncidentTypeChanged(incidentType) {
    console.log('onIncidentTypeChanged(): incidentType:', incidentType);
    this.buildIncidentFieldOptions(incidentType);
  }



  buildIncidentFieldOptions(incidentType) {
    console.log('buildIncidentFieldOptions(): incidentType:', incidentType);

    for (let field of Object.values(this.fetchedIncidentFieldDefinitions)  ) {
      const cliName = field.cliName;
      const friendlyName = field.name;
      const associatedToAll = field.associatedToAll;
      const system = field.system;
      /*if (system) {
        console.log('system field:', cliName);
      }*/
    }
  }


}
