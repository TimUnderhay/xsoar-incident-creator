// based on https://github.com/hivivo/ngx-json-viewer

import { Component, OnInit, OnChanges, Input, Output, EventEmitter, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { FieldType } from '../types/incident-fields';
import { Subject } from 'rxjs';
import * as utils from '../utils';
import { FetcherService } from '../fetcher-service';

type valueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';


export interface Segment {
  key: string;
  value: any;
  type: valueType;
  description: string;
  expanded: boolean;
  length?: number;
  expandable: boolean;
  path: string; // the JMESPath,
  spacerValue?: number; // value of spacer
}

export const acceptableDataTypesPerFieldType = {
  // key is field type
  'number': ['number', 'string'], // string will only work if it contains a number
  'shortText': ['number', 'string', 'boolean', 'null'],
  'longText': ['number', 'string', 'boolean', 'null'],
  'boolean': ['boolean', 'string', 'number'], // string will only work if it's 'true'|'false'.  For number, <=0 is false, and >0 is true.
  'grid': ['array', 'object'], // grid accepts an array of objects
  'url': ['string', 'null'],
  'html': ['string', 'number', 'boolean', 'null'],
  'markdown': ['string', 'null'],
  'role': ['array', 'string', 'null'],
  'user': ['string', 'null'],
  'singleSelect': ['number', 'string', 'boolean', 'null'],
  'multiSelect': ['array', 'number', 'string', 'boolean', 'null'],
  'internal': [],
  'date': [],
  'attachments': [],
  'tagsSelect': ['string', 'null']
};



@Component({
  selector: 'ngx-json-viewer',
  templateUrl: './ngx-json-viewer.component.html'
})



export class NgxJsonViewerComponent implements OnInit, OnChanges {

  constructor(
    private fetcherService: FetcherService, // import our URL fetcher
    private changeDetector: ChangeDetectorRef
  ) {}

  @Input() json: Object;
  @Input() expanded = false;
  @Input() path = '';
  @Input() selectionMode = false;
  @Input() selectionModeFieldType: FieldType;
  @Input() depth = 1;

  segments: Segment[] = [];
  index = 0;
  typeOfJson: valueType;
  get jsonLen(): number {
    return Object.keys(this.json).length;
  }
  hovering: Segment;
  enableClickOutside = false;
  spacerWidthBaseDepthOne = 2.2; // extra space is needed to allow the selector arrow to fit on root segments
  spacerWidthBase = 1.5; // unit: rem


  ngOnInit() {
    // if an array, Object.keys() will return the values
    // console.log('NgxJsonViewerComponent: ngOnInit(): firstLevel:', this.firstLevel);
    // console.log('NgxJsonViewerComponent: ngOnInit(): expanded:', this.expanded);
  }



  getSpacerWidth(segment: Segment): number {
    if (this.depth === 1) {
      return this.spacerWidthBaseDepthOne * this.depth;
    }
    return this.spacerWidthBase * this.depth;
  }



  getType(value): valueType {
    switch (typeof value) {

      case 'number': {
        return 'number';
      }

      case 'boolean': {
        return 'boolean';
      }

      case 'string': {
        return 'string';
      }

      case 'object': {

        if (value === null) {
          // yes, null is an object
          return 'null';
        }

        else if (Array.isArray(value)) {
          return 'array';
        }

        else {
          return 'object';
        }

      }
    }
  }



  ngOnChanges(values: SimpleChanges) {
    if ('selectionMode' in values) {
      setTimeout( () => this.enableClickOutside = this.selectionMode );
    }

    if (!utils.firstOrChangedSimpleChange('json', values)) {
      return;
    }

    this.typeOfJson = this.getType(this.json);

    let segments: Segment[] = [];

    if (typeof this.json === 'object') {
      // object = object, array, null,
      Object.keys(this.json).forEach( key => {
        const segment = this.buildSegment(key, this.json[key])
        segments.push(segment);
      });
    }

    else {
      // we really shouldn't enter this block, as this.json should only ever be an array or an object
      console.error('NgxJsonViewerComponent: JSON object is not an object!  json:', this.json);
      const segment = this.buildSegment(`(${typeof this.json})`, this.json)
      segments.push(segment);
    }

    this.segments = segments;
  }



  buildJMESPath(key) {
    if (this.typeOfJson === 'array') {
      return `${this.path}[${this.index++}]`;
    }
    let leadingDot = this.depth === 1 ? '' : '.';
    return `${this.path}${leadingDot}${key}`;
  }



  private buildSegment(key: any, value: any): Segment {
    const segment: Segment = {
      key: key,
      value: value,
      type: undefined,
      description: '' + value,
      expanded: this.expanded,
      expandable: false,
      path: this.buildJMESPath(key)
    };

    switch (this.getType(segment.value)) {

      case 'number': {
        segment.type = 'number';
        break;
      }

      case 'boolean': {
        segment.type = 'boolean';
        break;
      }

      case 'string': {
        segment.type = 'string';
        segment.description = segment.value.length === 0 ? '""' : segment.value;
        break;
      }

      case 'null': {
        // yes, null is an object
        segment.type = 'null';
        segment.description = 'null';
        break;
      }

      case 'array': {
        segment.type = 'array';
        segment.length = segment.value.length;
        segment.description = `[] ${segment.length} items`;
        segment.expandable = true;
        break;
      }

      case 'object': {
        segment.type = 'object';
        segment.length = Object.keys(segment.value).length;
        segment.description = `{} ${segment.length} items`;
        segment.expandable = true;
        break;
      }

    }

    segment.spacerValue = this.getSpacerWidth(segment);

    return segment;
  }



  getJMESPath(segment: Segment): string {
    return segment.path;
  }



  rowClickHandler(segment: Segment) {
    console.log('NgxJsonViewerComponent: rowClickHandler(): segment:', segment);
    if (this.selectionMode && this.segmentTypeIsValidForFieldType(segment)) {
      this.onSelectionClicked(segment);
    }
    else if (segment.expandable) {
      this.toggle(segment);
    }
    // else do nothing
  }



  onSelectionClicked(segment: Segment) {
    // Massage the data to match field type
    console.log('NgxJsonViewerComponent: onSelectionClicked(): segment:', segment);
    this.fetcherService.fieldMappingSelectionReceived.next(segment);
  }



  toggle(segment: Segment) {
    console.log('NgxJsonViewerComponent: toggle()');
    segment.expanded = segment.expandable ? !segment.expanded : false;
  }



  expansionArrowClickHandler(event: MouseEvent, segment: Segment) {
    console.log('NgxJsonViewerComponent: expansionArrowClickHandler(): segment:', segment);
    event.stopPropagation();
    this.toggle(segment);
  }



  segmentTypeIsValidForFieldType(segment: Segment) {
    if (acceptableDataTypesPerFieldType[this.selectionModeFieldType].includes(segment.type)) {
      return true;
    }
    return false;
  }



  enableSelectionIcon(segment: Segment): boolean {
    if ( this.hovering && this.hovering === segment && this.selectionMode && this.segmentTypeIsValidForFieldType(segment) ) {
      if (segment.expandable && segment.expanded) {
        return false;
      }
      return true;
    }
    return false;
  }


  onClickOutside() {
    console.log('NgxJsonViewerComponent: onClickOutside()');
    this.fetcherService.fieldMappingSelectionEnded.next();
  }

}
