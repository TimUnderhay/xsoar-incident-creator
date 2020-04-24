// based on https://github.com/hivivo/ngx-json-viewer

import { Component, OnInit, OnChanges, Input, Output, EventEmitter, SimpleChanges } from '@angular/core';
import { FieldType } from '../types/incident-fields';
import { Subject } from 'rxjs';
import * as utils from '../utils';

type valueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';


export interface Segment {
  key: string;
  value: any;
  type: valueType;
  description: string;
  expanded: boolean;
  length?: number;
  expandable: boolean;
  path: string; // the JMESPath
}

export const acceptableDataTypesPerFieldType = {
  // key is field type
  'number': ['number', 'string'], // string will only work if it contains a number
  'shortText': ['number', 'string', 'boolean', 'null'],
  'longText': ['number', 'string', 'boolean', 'null'],
  'boolean': ['boolean'],
  'grid': ['array', 'object'], // grid accepts an array of objects
  'url': ['string', 'null'],
  'html': ['string', 'null'],
  'role': ['string', 'null'],
  'markdown': ['string', 'null'],
  'user': ['string', 'null'],
  'singleSelect': [],
  'multiSelect': [],
  'internal': [],
  'date': [],
  'timer': [],
  'attachments': [],
  'tags': []
};



@Component({
  selector: 'ngx-json-viewer',
  templateUrl: './ngx-json-viewer.component.html'
})



export class NgxJsonViewerComponent implements OnInit, OnChanges {

  @Input() json: Object;
  @Input() expanded = false;
  @Input() path = '';
  @Input() firstLevel = false;
  @Input() selectionMode = false;
  @Input() selectionModeFieldType: FieldType;
  @Input() jsonSelectionReceivedSubject: Subject<Segment>;


  segments: Segment[] = [];
  index = 0;
  typeOfJson: valueType;
  get jsonLen(): number {
    return Object.keys(this.json).length;
  }
  hovering: Segment;


  ngOnInit() {
    // if an array, Object.keys() will return the values
    // console.log('NgxJsonViewerComponent: ngOnInit(): firstLevel:', this.firstLevel);
    // console.log('NgxJsonViewerComponent: ngOnInit(): expanded:', this.expanded);
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



  toggle(segment: Segment) {
    console.log('NgxJsonViewerComponent: toggle()');
    segment.expanded = segment.expandable ? !segment.expanded : false;
  }



  buildJMESPath(key) {
    if (this.typeOfJson === 'array') {
      return `${this.path}[${this.index++}]`;
    }
    
    let leadingDot = this.firstLevel ? '' : '.';
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
        segment.path = `${this.path}.${segment.key}`;
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



  segmentTypeIsValidForFieldType(segment: Segment) {
    if (acceptableDataTypesPerFieldType[this.selectionModeFieldType].includes(segment.type)) {
      return true;
    }
    return false;
  }



  onSelectionClicked(segment: Segment) {
    // Massage the data to match field type
    console.log('NgxJsonViewerComponent: onSelectionClicked(): segment:', segment);
    if (this.selectionModeFieldType === 'grid' && segment.type === 'object') {
      // grid fields accept only arrays of objects
      segment.value = [segment.value];
    }
    if (['shortText', 'longText', 'url', 'html', 'markdown', 'user', 'role'].includes(this.selectionModeFieldType) && segment.type === 'null') {
      segment.value = 'null';
    }
    if (segment.type === 'string' && this.selectionModeFieldType === 'number' && (segment.value as string).match(/^\d+(?:\.\d+)?$/) ) {
      segment.value = parseFloat(segment.value);
    }
    if (segment.type === 'string' && this.selectionModeFieldType === 'number' && !(segment.value as string).match(/^\d+(?:\.\d+)?$/) ) {
      return;
    }
    this.jsonSelectionReceivedSubject.next(segment);
  }



  enableSelectionIcon(segment: Segment): boolean {
    if ( this.hovering && this.hovering === segment && this.selectionMode && this.segmentTypeIsValidForFieldType(segment) ) {
      return true;
    }
    return false;
  }

}
