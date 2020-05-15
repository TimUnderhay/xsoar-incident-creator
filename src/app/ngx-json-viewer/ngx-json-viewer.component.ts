// based on https://github.com/hivivo/ngx-json-viewer

import { Component, OnInit, OnChanges, Input, Output, EventEmitter, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { FieldType } from '../types/incident-fields';
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
  hasChildren: boolean;
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
  'date': ['string', 'number'],
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

  @Input() json: Object | Array<any>;
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
  childHovering: Segment;
  enableClickOutside = false;
  spacerWidthBaseDepthOne = 2.2; // extra space is needed to allow the selector arrow to fit on root segments
  spacerWidthBase = 1.5; // unit: rem
  hasExpandableChildren = false;


  ngOnInit() {
    // console.log('NgxJsonViewerComponent: ngOnInit(): expanded:', this.expanded);
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
      this.hasExpandableChildren = this.valueHasAnExpandableChild(this.json);
      Object.keys(this.json).forEach( key => {
        // if an array, key will be the array index
        const segment = this.buildSegment(key, this.json[key])
        segments.push(segment);
      });
    }

    else {
      // we really shouldn't enter this block, as this.json should only ever be an array or an object
      console.error('NgxJsonViewerComponent: JSON object is not an object!  json:', this.json);
      this.hasExpandableChildren = this.valueHasAnExpandableChild(this.json);
      const segment = this.buildSegment(`(${typeof this.json})`, this.json)
      segments.push(segment);
    }

    this.segments = segments.sort(this.segmentsSort);
  }



  segmentsSort(a: Segment, b: Segment): number {
    return utils.sortArrayNaturally(a.key, b.key);
  }



  getSpacerWidth(segment: Segment): number {
    if (this.depth === 1) {
      return this.spacerWidthBaseDepthOne * this.depth;
    }
    if (!this.hasExpandableChildren && this.depth > 2) {
      return this.spacerWidthBase * this.depth - this.spacerWidthBase * .7;
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
      path: this.buildJMESPath(key),
      hasChildren: false
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
    segment.hasChildren = this.segmentHasChildren(segment);

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



  keyClickHandler(segment: Segment) {
    if (segment.expandable) {
      this.toggle(segment);
    }
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
      if (segment.expandable && segment.expanded && this.childHovering === segment) {
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



  segmentHasChildren(segment: Segment): boolean {
    if (segment.expandable && segment.type === 'object' && Object.keys(segment.value).length !== 0)  {
      return true;
    }
    else if (segment.expandable && segment.type === 'array' && segment.value.length !== 0)  {
      return true;
    }
    return false;
  }



  objectOrArrayHasChildren(value: Object | Array<any>) {
    // if value is an object or an array, return whether it has children (i.e. a non-zero length or non-zero key length)
    const valueType = this.getType(value);
    if (valueType === 'array' && (value as Array<any>).length !== 0) {
      return true;
    }
    else if (valueType === 'object' && Object.keys(value).length !== 0) {
      return true;
    }
    return false;
  }



  valueHasAnExpandableChild(value: Object | Array<any>): boolean {
    const valueType = this.getType(value);
    if (! ['object', 'array'].includes(valueType)) {
      // only arrays and objects can have children
      return false;
    }

    const outerList = valueType === 'array' ? value : Object.values(value); // build iterable list of children
    for (let innerValue of outerList as Array<any>) { // iterate over children
      if (this.objectOrArrayHasChildren(innerValue)) { // check to see if the child has children
        return true;
      }
    }
    
    return false;
  }

}
