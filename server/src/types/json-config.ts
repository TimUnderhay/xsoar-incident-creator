export interface JSONConfig {
  id?: string; // assigned by server
  name: string;
  json: object; // object | Array<any>
}

export interface JSONConfigRef {
  id: string;
  name: string;
}

export interface JSONConfigRefs {
  [jsonId: string]: JSONConfigRef;
}
