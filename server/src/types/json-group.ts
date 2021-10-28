export interface JsonGroup extends Object {
  id?: string; // added by the server
  name: string;
  jsonFileIds: string[]; // an array of json config id's
}

export interface JsonGroups {
  [id: string]: JsonGroup;
}
