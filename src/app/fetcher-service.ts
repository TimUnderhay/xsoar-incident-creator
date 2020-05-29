import { Injectable } from '@angular/core';
import { HttpHeaders, HttpClient, HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { User } from './types/user';
import { DemistoEndpointTestResult } from './types/demisto-endpoint-status';
import { FetchedIncidentField } from './types/fetched-incident-field';
import { FetchedIncidentType } from './types/fetched-incident-types';
import { IncidentConfig, IncidentConfigs, IncidentJsonFileConfig, IncidentCreationConfig } from './types/incident-config';
import { DemistoEndpoint, DemistoEndpoints } from './types/demisto-endpoints';
import { DefaultDemistoEndpoint } from './types/default-demisto-endpoint';
import { DemistoIncidentImportResult } from './types/demisto-incident-import-result';
import * as JSEncrypt from 'jsencrypt';
import { Subject } from 'rxjs';
import { IncidentFieldUI } from './types/incident-fields';
import { Segment } from './ngx-json-viewer/ngx-json-viewer.component';
import { IncidentFieldRowComponent } from './incident-field-row.component';
import { FreeformJSONConfig } from './types/freeform-json-config';
import { JsonGroup, JsonGroups } from './types/json-group';
import { FileAttachmentConfig, FileAttachmentConfigs, FileToPush } from './types/file-attachment';

export interface FieldMappingSelection {
  field: IncidentFieldUI;
  method: 'static' | 'jmespath';
}


@Injectable({providedIn: 'root'})

export class FetcherService {

  constructor( private http: HttpClient ) {}

  // demistoProperties: DemistoProperties; // gets set during test
  apiPath = '/api';
  currentUser: User;
  private publicKey: string;
  encryptor: JSEncrypt.JSEncrypt;

  // RXJS Observables
  // These technically don't belong in a fetcher service, but there's no need to write another service just to house them, either.
  // We use the fetcherService to easily bounce messages between components
  fieldMappingSelectionActive = new Subject<FieldMappingSelection>();
  fieldMappingSelectionEnded = new Subject<void>();
  fieldMappingSelectionReceived = new Subject<Segment>();



  buildHeaders(authUser = null): HttpHeaders {
    let headers = new HttpHeaders(
      {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }
    );
    if (authUser) {
      headers = headers.set('Authorization', authUser);
    }
    return headers;
  }



  logResult(res): any {
    console.log('FetcherService: logResult:', res);
    return res;
  }



  ///////// AUTHENTICATION /////////

  getLoggedInUser(): Promise<User> {
    const headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    return this.http.get(this.apiPath + '/whoami', { headers } )
                    .toPromise()
                    .then( (user: User) => {
                      this.currentUser = user;
                      return user;
                     } );
  }




  ///////// XSOAR ENDPOINTS /////////

  testDemistoEndpointById(serverId: string): Promise<DemistoEndpointTestResult> {
    const headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    return this.http.get(`${this.apiPath}/demistoEndpoint/test/${encodeURIComponent(serverId)}`, { headers } )
                    .toPromise()
                    .then( (status: DemistoEndpointTestResult) => status );
  }



  testDemistoEndpointAdhoc(serverParams: DemistoEndpoint): Promise<DemistoEndpointTestResult> {
    if ('apiKey' in serverParams) {
      serverParams.apiKey = this.encrypt(serverParams.apiKey);
    }
    const headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    return this.http.post(`${this.apiPath}/demistoEndpoint/test/adhoc`, serverParams, { headers } )
                    .toPromise()
                    .then( (status: DemistoEndpointTestResult) => status );
  }



  getDemistoEndpoints(): Promise<DemistoEndpoints> {
    const headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    return this.http.get(this.apiPath + '/demistoEndpoint', { headers } )
                    .toPromise()
                    .then( (endpoints: DemistoEndpoints) => endpoints );
  }



  setDefaultDemistoEndpoint(serverId): Promise<DemistoEndpointTestResult> {
    const headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    const body = { serverId };
    return this.http.post(this.apiPath + '/demistoEndpoint/default', body, { headers } )
                    .toPromise()
                    .then( res => res as DemistoEndpointTestResult );
  }



  getDefaultDemistoEndpoint(): Promise<DefaultDemistoEndpoint> {
    const headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    return this.http.get(this.apiPath + '/demistoEndpoint/default', { headers } )
                    .toPromise()
                    .then( res => res as DefaultDemistoEndpoint);
  }



  createDemistoEndpoint(url, apiKey, trustAny): Promise<DemistoEndpointTestResult> {
    const headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    let body = { url, apiKey: this.encrypt(apiKey), trustAny };
    return this.http.post(this.apiPath + '/demistoEndpoint', body, { headers } )
                    .toPromise()
                    .then( res => res as DemistoEndpointTestResult );
  }



  updateDemistoEndpoint(serverId, url, trustAny, apiKey?): Promise<DemistoEndpointTestResult> {
    const headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    let body = { url, trustAny, serverId };
    if (apiKey) {
      body['apiKey'] = this.encrypt(apiKey);
    }
    return this.http.post(this.apiPath + '/demistoEndpoint/update', body, { headers } )
                    .toPromise()
                    .then( res => res as DemistoEndpointTestResult );
  }



  deleteDemistoEndpoint(serverId): Promise<DemistoEndpointTestResult> {
    const headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    serverId = encodeURIComponent(serverId);
    console.log('FetcherService: deleteDemistoEndpoint(): serverId:', serverId);
    return this.http.delete(`${this.apiPath}/demistoEndpoint/${serverId}`, { headers } )
                    .toPromise()
                    .then( res => res as DemistoEndpointTestResult );
  }



  ///////// INCIDENTS /////////

  createDemistoIncident( config: IncidentCreationConfig ): Promise<any> {
    const headers = this.buildHeaders(this.currentUser.username);
    console.log('FetcherService: createDemistoIncident(): Current User: ', this.currentUser.username);
    return this.http.post(this.apiPath + '/createDemistoIncident', config, { headers } )
                    .toPromise();
  }



  createDemistoIncidentFromJson( json: any ): Promise<any> {
    const headers = this.buildHeaders(this.currentUser.username);
    console.log('FetcherService: createDemistoIncidentFromJson(): Current User: ', this.currentUser.username);
    return this.http.post(this.apiPath + '/createDemistoIncidentFromJson', json, { headers } )
                    .toPromise();
  }



  getIncidentFieldDefinitions(serverId): Promise<FetchedIncidentField[]> {
    serverId = encodeURIComponent(serverId);
    const headers = this.buildHeaders();
    return this.http.get(`${this.apiPath}/incidentFields/${serverId}`, { headers } )
                    .toPromise()
                    .then( (res: any) => res.incident_fields );
  }



  getIncidentTypes(serverId): Promise<FetchedIncidentType[]> {
    serverId = encodeURIComponent(serverId);
    const headers = this.buildHeaders();
    return this.http.get(`${this.apiPath}/incidentType/${serverId}`, { headers } )
                    .toPromise()
                    // .then( (res: any) => this.logResult(res) )
                    .then( (res: any) => res.incident_types as FetchedIncidentType[] );
  }



  getSampleIncident(): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.get(this.apiPath + '/sampleIncident', { headers } )
                    .toPromise();
  }



  getSavedIncidentConfigurations(): Promise<IncidentConfigs> {
    const headers = this.buildHeaders();
    return this.http.get(this.apiPath + '/incidentConfig/all', { headers } )
                    .toPromise()
                    .then(value => value as IncidentConfigs);
  }



  saveNewIncidentConfiguration(config: IncidentConfig): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/incidentConfig', config, { headers } )
                    .toPromise();
  }



  saveIncidentConfiguration(config: IncidentConfig): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/incidentConfig/update', config, { headers } )
                    .toPromise();
  }



  deleteIncidentConfiguration(name: string): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.delete(this.apiPath + `/incidentConfig/${name}`, { headers } )
                    .toPromise();
  }



  createInvestigation(incidentId, serverId): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/createInvestigation', {incidentId, serverId}, { headers } )
                    .toPromise();
                    // .then( (value: any) => value.success);
  }



  demistoIncidentImport(incidentId, serverId): Promise<DemistoIncidentImportResult> {
    const headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/demistoIncidentImport', {incidentId, serverId}, { headers } )
                    .toPromise()
                    .then( (res: DemistoIncidentImportResult) => res);
  }




  getPublicKey(): Promise<void> {
    const headers = this.buildHeaders();
    return this.http.get(this.apiPath + '/publicKey', { headers } )
                    .toPromise()
                    .then( (value: any) => this.publicKey = value.publicKey );
  }



  async initEncryption(): Promise<any> {
    await this.getPublicKey();
    this.encryptor = new JSEncrypt.JSEncrypt();
    this.encryptor.setPublicKey(this.publicKey);
  }



  encrypt(str): string {
    return this.encryptor.encrypt(str);
  }



  ///////// JSON /////////

  getSavedJSONConfigurationNames(): Promise<string[]> {
    const headers = this.buildHeaders();
    return this.http.get(this.apiPath + '/json', { headers } )
                    .toPromise()
                    .then(value => value as string[]);
  }



  getSavedJSONConfiguration(name): Promise<object | Array<any>> {
    const headers = this.buildHeaders();
    return this.http.get(`${this.apiPath}/json/${name}`, { headers } )
                    .toPromise<object | Array<any>>();
  }



  saveNewFreeformJSONConfiguration(config: FreeformJSONConfig): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/json', config, { headers } )
                    .toPromise();
  }



  deleteFreeformJSONConfiguration(name: string): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.delete(this.apiPath + `/json/${name}`, { headers } )
                    .toPromise();
  }



  setDefaultIncidentJsonFile(incidentConfigName, jsonConfigName): Promise<any> {
    const headers = this.buildHeaders();
    const config: IncidentJsonFileConfig = {
      configName: incidentConfigName,
      jsonName: jsonConfigName
    };
    return this.http.post(this.apiPath + '/incidentConfig/defaultJson', config, { headers } )
                    .toPromise();
  }



  clearDefaultIncidentJsonFile(incidentConfigName): Promise<any> {
    const headers = this.buildHeaders();
    const config: IncidentJsonFileConfig = {
      configName: incidentConfigName,
      jsonName: null
    };
    return this.http.post(this.apiPath + '/incidentConfig/defaultJson', config, { headers } )
                    .toPromise();
  }



  ///////// JSON GROUPS /////////

  getSavedJsonGroupConfigurations(): Promise<JsonGroups> {
    const headers = this.buildHeaders();
    return this.http.get(this.apiPath + '/jsonGroup/all', { headers } )
                    .toPromise()
                    .then(value => value as JsonGroups);
  }



  saveNewJsonGroupConfiguration(config: JsonGroup): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/jsonGroup', config, { headers } )
                    .toPromise();
  }



  saveJsonGroupConfiguration(config: JsonGroup): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/jsonGroup/update', config, { headers } )
                    .toPromise();
  }



  deleteJsonGroupConfiguration(name: string): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.delete(this.apiPath + `/jsonGroup/${name}`, { headers } )
                    .toPromise();
  }



  ///////// FILE ATTACHMENTS /////////

  getFileAttachmentConfigs(): Promise<FileAttachmentConfigs> {
    const headers = this.buildHeaders();
    return this.http.get(this.apiPath + '/attachment/all', { headers } )
                    .toPromise()
                    .then(value => value as FileAttachmentConfigs);
  }



  uploadFileAttachment(formData): Promise<any> {
    return this.http.post(`${this.apiPath}/attachment`, formData)
                    .toPromise();
  }



  updateFileAttachment(config: FileAttachmentConfig): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/attachment/update', config, { headers } )
                    .toPromise();
  }



  deleteFileAttachment(id: string): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.delete(this.apiPath + `/attachment/${id}`, { headers } )
                    .toPromise();
  }



  downloadFileAttachment(id) {
    this.http.get(this.apiPath + `/attachment/${id}`, { observe: 'response', responseType: 'blob' })
             .subscribe( response => {
               const headers = response.headers;
               let filename = headers.get('Content-Disposition').split('filename="')[1];
               filename = filename.substr(0, filename.length - 1); // remove trailing double quote from filename
               const blob = response.body;
               const dataType = blob.type;
               const binaryData = [blob];
               const downloadLink = document.createElement('a');
               const newBlob = new Blob(binaryData, {type: dataType});
               downloadLink.href = window.URL.createObjectURL(newBlob);
               downloadLink.setAttribute('download', filename);
               document.body.appendChild(downloadLink);
               downloadLink.click();
               window.URL.revokeObjectURL(downloadLink.href);
               downloadLink.parentNode.removeChild(downloadLink);
             });
  }



  uploadFileToDemistoIncident(file: FileToPush): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/attachment/push', file, { headers } )
                    .toPromise();
  }

}
