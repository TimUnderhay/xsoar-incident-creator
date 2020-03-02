import { Component, OnInit, ViewChildren, ChangeDetectorRef } from '@angular/core';
import { FetcherService } from './fetcher-service';
import { DemistoAPI, DemistoAPIEndpoints } from './types/demisto-properties';
import { ConfirmationService } from 'primeng/api';

@Component({
    // tslint:disable-next-line: component-selector
    selector: 'freeform-json',
    templateUrl: './freeform-json.component.html'
  })

export class FreeformJsonComponent implements OnInit {

    constructor(
        private fetcherService: FetcherService, // import our URL fetcher
        private confirmationService: ConfirmationService,
        private changeDetector: ChangeDetectorRef
    ) {}

    ngOnInit() {

    }

}
