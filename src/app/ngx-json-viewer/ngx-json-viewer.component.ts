// based on https://github.com/hivivo/ngx-json-viewer

import { Component, OnInit, OnChanges, Input, Output, EventEmitter } from '@angular/core';

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



@Component({
  selector: 'ngx-json-viewer',
  templateUrl: './ngx-json-viewer.component.html'
})



export class NgxJsonViewerComponent implements OnInit, OnChanges {

  @Input() json: Object;
  @Input() expanded = false;
  @Input() cleanOnChange = true;
  @Input() selectableMode = false;
  @Input() path = '';
  @Input() firstLevel = false;
  @Output() selectedPath = new EventEmitter<string>();


  segments: Segment[] = [];
  index = 0;
  typeOfJson: valueType;
  get jsonLen(): number {
    return Object.keys(this.json).length;
  }


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



  ngOnChanges() {
    if (this.cleanOnChange) {
      this.segments = [];
    }
    
    this.typeOfJson = this.getType(this.json);

    if (typeof this.json === 'object') {
      // object = object, array, null,
      Object.keys(this.json).forEach( key => {
        const segment = this.buildSegment(key, this.json[key])
        this.segments.push(segment);
      });
    }

    else {
      // we really shouldn't enter this block, as this.json should only ever be an array or an object
      console.error('NgxJsonViewerComponent: JSON object is not an object!  json:', this.json);
      const segment = this.buildSegment(`(${typeof this.json})`, this.json)
      this.segments.push(segment);
    }
  }



  toggle(segment: Segment) {
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

}
