import { Injectable } from '@angular/core';
import { HttpHeaders, HttpClient } from '@angular/common/http';
import { User } from './types/user';
import { DefaultDemistoEndpoint, DemistoEndpointTestResult } from './types/demisto-endpoint';
import { FetchedIncidentField } from './types/fetched-incident-field';
import { FetchedIncidentType } from './types/fetched-incident-type';
import { IncidentConfig, IncidentConfigs, IncidentJsonFileConfig, IncidentJsonGroupConfig, IncidentCreationConfig } from './types/incident-config';
import { DemistoEndpoint, DemistoEndpoints } from './types/demisto-endpoint';
import { DemistoIncidentImportResult } from './types/demisto-incident-import-result';
import * as JSEncrypt from 'jsencrypt';
import { Subject, Observable } from 'rxjs';
import { IncidentFieldUI } from './types/incident-field';
import { Segment } from './ngx-json-viewer/ngx-json-viewer.component';
import { JSONConfig, JSONConfigRef } from './types/json-config';
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



  /// INITIALISATION / ENCRYPTION ///

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

  /// END INITIALISATION / ENCRYPTION ///



  /// XSOAR ENDPOINTS ///

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



  createDemistoEndpoint(url, apiKey, trustAny, proxy): Promise<DemistoEndpointTestResult> {
    const headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    const body = { url, apiKey: this.encrypt(apiKey), trustAny };
    if (proxy !== '') {
      body['proxy'] = proxy;
    }
    return this.http.post(this.apiPath + '/demistoEndpoint', body, { headers } )
                    .toPromise()
                    .then( res => res as DemistoEndpointTestResult );
  }



  updateDemistoEndpoint(id, url, trustAny, proxy, apiKey?): Promise<DemistoEndpointTestResult> {
    const headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    const body = {
      url,
      trustAny,
      id
    };
    if (apiKey) {
      body['apiKey'] = this.encrypt(apiKey);
    }
    if (proxy !== '') {
     body['proxy']  = proxy;
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
    return this.http.delete(`${this.apiPath}/demistoEndpoint/${encodeURIComponent(serverId)}`, { headers } )
                    .toPromise()
                    .then( res => res as DemistoEndpointTestResult );
  }

  /// END XSOAR ENDPOINTS ///



  /// INCIDENT CONFIGS ///

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



  saveUpdatedIncidentConfiguration(config: IncidentConfig): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/incidentConfig/update', config, { headers } )
                    .toPromise();
  }



  deleteIncidentConfiguration(id: string): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.delete(this.apiPath + `/incidentConfig/${encodeURIComponent(id)}`, { headers } )
                    .toPromise();
  }

  /// END INCIDENT CONFIGS ///



  /// INCIDENTS ///

  createDemistoIncident( config: IncidentCreationConfig ): Promise<any> {
    const headers = this.buildHeaders(this.currentUser.username);
    return this.http.post(this.apiPath + '/createDemistoIncident', config, { headers } )
                    .toPromise();
  }



  createDemistoIncidentFromJson( json: any ): Promise<any> {
    const headers = this.buildHeaders(this.currentUser.username);
    return this.http.post(this.apiPath + '/createDemistoIncidentFromJson', json, { headers } )
                    .toPromise();
  }



  getIncidentFieldDefinitions(serverId): Promise<FetchedIncidentField[]> {
    serverId = encodeURIComponent(serverId);
    const headers = this.buildHeaders();
    return this.http.get(`${this.apiPath}/incidentFields/${encodeURIComponent(serverId)}`, { headers } )
                    .toPromise()
                    .then( (res: any) => res.incident_fields );
  }



  getIncidentTypes(serverId): Promise<FetchedIncidentType[]> {
    serverId = encodeURIComponent(serverId);
    const headers = this.buildHeaders();
    return this.http.get(`${this.apiPath}/incidentType/${encodeURIComponent(serverId)}`, { headers } )
                    .toPromise()
                    // .then( (res: any) => this.logResult(res) )
                    .then( (res: any) => res.incident_types as FetchedIncidentType[] );
  }



  getSampleIncident(): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.get(this.apiPath + '/sampleIncident', { headers } )
                    .toPromise();
  }



  createInvestigation(incidentId, serverId, version = 1): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/createInvestigation', {incidentId, version, serverId}, { headers } )
                    .toPromise();
  }



  demistoIncidentImport(incidentId, serverId): Promise<DemistoIncidentImportResult> {
    const headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/demistoIncidentImport', {incidentId, serverId}, { headers } )
                    .toPromise()
                    .then( (res: DemistoIncidentImportResult) => res);
  }

  /// END INCIDENTS ///



  /// JSON ///

  getSavedJSONConfigurations(): Promise<JSONConfigRef[]> {
    const headers = this.buildHeaders();
    return this.http.get(this.apiPath + '/json/all', { headers } )
                    .toPromise()
                    .then(value => value as JSONConfigRef[]);
  }



  getSavedJSONConfiguration(id): Promise<JSONConfig> {
    const headers = this.buildHeaders();
    return this.http.get(`${this.apiPath}/json/${encodeURIComponent(id)}`, { headers } )
                .toPromise()
                .then( value => value as JSONConfig);
  }



  saveNewFreeformJSONConfiguration(config: JSONConfig): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/json', config, { headers } )
                    .toPromise();
  }



  saveUpdatedFreeformJSONConfiguration(config: JSONConfig): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/json/update', config, { headers } )
                    .toPromise();
  }



  deleteFreeformJSONConfiguration(id: string): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.delete(this.apiPath + `/json/${encodeURIComponent(id)}`, { headers } )
                    .toPromise();
  }



  setDefaultIncidentJsonFile(incidentConfigId, jsonConfigId): Promise<any> {
    console.log('incidentConfigId, jsonConfigId:', incidentConfigId, jsonConfigId);
    const headers = this.buildHeaders();
    const config: IncidentJsonFileConfig = {
      incidentConfigId,
      jsonId: jsonConfigId
    };
    return this.http.post(this.apiPath + '/incidentConfig/defaultJson', config, { headers } )
                    .toPromise();
  }



  clearDefaultIncidentJsonFile(incidentConfigId): Promise<any> {
    const headers = this.buildHeaders();
    const config: IncidentJsonFileConfig = {
      incidentConfigId,
      jsonId: null
    };
    return this.http.post(this.apiPath + '/incidentConfig/defaultJson', config, { headers } )
                    .toPromise();
  }

  /// END JSON ///



  /// JSON GROUPS ///

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



  saveUpdatedJsonGroupConfiguration(config: JsonGroup): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/jsonGroup/update', config, { headers } )
                    .toPromise();
  }



  deleteJsonGroupConfiguration(id: string): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.delete(this.apiPath + `/jsonGroup/${encodeURIComponent(id)}`, { headers } )
                    .toPromise();
  }



  setDefaultIncidentJsonGroup(incidentConfigId, jsonGroupId): Promise<any> {
    console.log('incidentConfigId, jsonGroupId:', incidentConfigId, jsonGroupId);
    const headers = this.buildHeaders();
    const config: IncidentJsonGroupConfig = {
      incidentConfigId,
      jsonGroupId
    };
    return this.http.post(this.apiPath + '/incidentConfig/defaultJsonGroup', config, { headers } )
                    .toPromise();
  }



  clearDefaultIncidentJsonGroup(incidentConfigId): Promise<any> {
    const headers = this.buildHeaders();
    const config: IncidentJsonGroupConfig = {
      incidentConfigId,
      jsonGroupId: null
    };
    return this.http.post(this.apiPath + '/incidentConfig/defaultJsonGroup', config, { headers } )
                    .toPromise();
  }

  /// END JSON GROUPS ///



  /// FILE ATTACHMENTS ///

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
    return this.http.delete(this.apiPath + `/attachment/${encodeURIComponent(id)}`, { headers } )
                    .toPromise();
  }



  downloadFileAttachment(id) {
    this.http.get(this.apiPath + `/attachment/${encodeURIComponent(id)}`, { observe: 'response', responseType: 'blob' })
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



  downloadJSONFile(incidentJson, filename) {
    const jsonse = JSON.stringify(incidentJson, null, 2);
    const encoder = new TextEncoder();
    encoder.encode(jsonse);

    const downloadLink = document.createElement('a');
    const newBlob = new Blob([jsonse], {type: 'application/json'});
    downloadLink.href = window.URL.createObjectURL(newBlob);
    downloadLink.setAttribute('download', filename);
    document.body.appendChild(downloadLink);
    downloadLink.click();
    window.URL.revokeObjectURL(downloadLink.href);
    downloadLink.parentNode.removeChild(downloadLink);
  }



  uploadFileToDemistoIncident(file: FileToPush): Promise<any> {
    const headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/attachment/push', file, { headers } )
                    .toPromise();
  }

  /// END FILE ATTACHMENTS ///

}
