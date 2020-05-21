export interface JsonGroup extends Object {
  name: string;
  jsonConfigs: string[]; // an array of json config names
}

export interface JsonGroups {
  [index: string]: JsonGroup;
}
