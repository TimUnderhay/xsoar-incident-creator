import { Component, OnInit, ViewChildren, ChangeDetectorRef } from '@angular/core';
import { FetcherService } from './fetcher-service';
import { DemistoEndpoint, DemistoEndpoints } from './types/demisto-endpoints';
import { ConfirmationService } from 'primeng/api';

@Component({
    // tslint:disable-next-line: component-selector
    selector: 'freeform-json',
    templateUrl: './freeform-json-ui.component.html'
  })

export class FreeformJsonUIComponent implements OnInit {

    constructor(
        private fetcherService: FetcherService, // import our URL fetcher
        private confirmationService: ConfirmationService,
        private changeDetector: ChangeDetectorRef
    ) {}

    ngOnInit() {

    }

}
