import { Injectable } from '@angular/core';
import { HttpHeaders, HttpClient } from '@angular/common/http';
import { User } from './types/user';
import { DemistoEndpointStatus } from './types/demisto-endpoint-status';
import { FetchedIncidentField } from './types/fetched-incident-field';
import { FetchedIncidentType } from './types/fetched-incident-types';
import { IncidentConfig, IncidentConfigs } from './types/incident-config';
import { DemistoEndpoint, DemistoEndpoints } from './types/demisto-endpoints';
import { DefaultDemistoEndpoint } from './types/default-demisto-endpoint';
import { DemistoIncidentImportResult } from './types/demisto-incident-import-result';
import * as JSEncrypt from 'jsencrypt';
import { Subject } from 'rxjs';
import { IncidentField } from './types/incident-fields';
import { Segment } from './ngx-json-viewer/ngx-json-viewer.component';
import { IncidentFieldRowComponent } from './incident-field-row.component';
import { FreeformJSONConfig } from './types/freeform-json-config';

export interface FieldMappingSelection {
  field: IncidentField;
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



  getLoggedInUser(): Promise<User> {
    let headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    return this.http.get(this.apiPath + '/whoami', { headers } )
                    .toPromise()
                    .then( (user: User) => {
                      this.currentUser = user;
                      return user;
                     } );
  }



  testDemistoEndpointById(serverId: string): Promise<DemistoEndpointStatus> {
    let headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    return this.http.get(`${this.apiPath}/demistoEndpoint/test/${encodeURIComponent(serverId)}`, { headers } )
                    .toPromise()
                    .then( (status: DemistoEndpointStatus) => status );
  }



  testDemistoEndpointAdhoc(serverParams: DemistoEndpoint): Promise<DemistoEndpointStatus> {
    if ('apiKey' in serverParams) {
      serverParams.apiKey = this.encrypt(serverParams.apiKey);
    }
    let headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    return this.http.post(`${this.apiPath}/demistoEndpoint/test/adhoc`, serverParams, { headers } )
                    .toPromise()
                    .then( (status: DemistoEndpointStatus) => status );
  }



  getDemistoEndpoints(): Promise<DemistoEndpoints> {
    let headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    return this.http.get(this.apiPath + '/demistoEndpoint', { headers } )
                    .toPromise()
                    .then( (endpoints: DemistoEndpoints) => endpoints );
  }



  setDefaultDemistoEndpoint(serverId): Promise<DemistoEndpointStatus> {
    let headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    const body = { serverId };
    return this.http.post(this.apiPath + '/demistoEndpoint/default', body, { headers } )
                    .toPromise()
                    .then( res => res as DemistoEndpointStatus );
  }



  getDefaultDemistoEndpoint(): Promise<DefaultDemistoEndpoint> {
    let headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    return this.http.get(this.apiPath + '/demistoEndpoint/default', { headers } )
                    .toPromise()
                    .then( res => res as DefaultDemistoEndpoint);
  }



  createDemistoEndpoint(url, apiKey, trustAny): Promise<DemistoEndpointStatus> {
    let headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    let body = { url, apiKey: this.encrypt(apiKey), trustAny };
    return this.http.post(this.apiPath + '/demistoEndpoint', body, { headers } )
                    .toPromise()
                    .then( res => res as DemistoEndpointStatus );
  }



  updateDemistoEndpoint(serverId, url, trustAny, apiKey?): Promise<DemistoEndpointStatus> {
    let headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    let body = { url, trustAny, serverId };
    if (apiKey) {
      body['apiKey'] = this.encrypt(apiKey);
    }
    return this.http.post(this.apiPath + '/demistoEndpoint/update', body, { headers } )
                    .toPromise()
                    .then( res => res as DemistoEndpointStatus );
  }



  deleteDemistoEndpoint(serverId): Promise<DemistoEndpointStatus> {
    let headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    serverId = encodeURIComponent(serverId);
    console.log('FetcherService: deleteDemistoEndpoint(): serverId:', serverId);
    return this.http.delete(`${this.apiPath}/demistoEndpoint/${serverId}`, { headers } )
                    .toPromise()
                    .then( res => res as DemistoEndpointStatus );
  }



  createDemistoIncident( params: any ): Promise<any> {
    let headers = this.buildHeaders(this.currentUser.username);
    console.log('FetcherService: createDemistoIncident(): Current User: ', this.currentUser.username);
    return this.http.post(this.apiPath + '/createDemistoIncident', params, { headers } )
                    .toPromise();
  }



  createDemistoIncidentFromJson( json: any ): Promise<any> {
    let headers = this.buildHeaders(this.currentUser.username);
    console.log('FetcherService: createDemistoIncidentFromJson(): Current User: ', this.currentUser.username);
    return this.http.post(this.apiPath + '/createDemistoIncidentFromJson', json, { headers } )
                    .toPromise();
  }



  getIncidentFieldDefinitions(serverId): Promise<FetchedIncidentField[]> {
    serverId = encodeURIComponent(serverId);
    let headers = this.buildHeaders();
    return this.http.get(`${this.apiPath}/incidentFields/${serverId}`, { headers } )
                    .toPromise()
                    .then( (res: any) => res.incident_fields );
  }



  getIncidentTypes(serverId): Promise<FetchedIncidentType[]> {
    serverId = encodeURIComponent(serverId);
    let headers = this.buildHeaders();
    return this.http.get(`${this.apiPath}/incidentType/${serverId}`, { headers } )
                    .toPromise()
                    // .then( (res: any) => this.logResult(res) )
                    .then( (res: any) => res.incident_types as FetchedIncidentType[] );
  }



  getSampleIncident(): Promise<any> {
    let headers = this.buildHeaders();
    return this.http.get(this.apiPath + '/sampleIncident', { headers } )
                    .toPromise();
  }



  getSavedIncidentConfigurations(): Promise<IncidentConfigs> {
    let headers = this.buildHeaders();
    return this.http.get(this.apiPath + '/incidentConfig/all', { headers } )
                    .toPromise()
                    .then(value => value as IncidentConfigs);
  }



  getSavedJSONConfigurationNames(): Promise<string[]> {
    let headers = this.buildHeaders();
    return this.http.get(this.apiPath + '/json', { headers } )
                    .toPromise()
                    .then(value => value as string[]);
  }



  getSavedJSONConfiguration(name): Promise<Object | Array<any>> {
    let headers = this.buildHeaders();
    return this.http.get(`${this.apiPath}/json/${name}`, { headers } )
                    .toPromise<Object | Array<any>>();
  }



  saveNewFreeformJSONConfiguration(config: FreeformJSONConfig): Promise<any> {
    let headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/json', config, { headers } )
                    .toPromise();
  }



  deleteFreeformJSONConfiguration(name: string): Promise<any> {
    let headers = this.buildHeaders();
    return this.http.delete(this.apiPath + `/json/${name}`, { headers } )
                    .toPromise();
  }



  saveNewIncidentConfiguration(config: IncidentConfig): Promise<any> {
    let headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/incidentConfig', config, { headers } )
                    .toPromise();
  }



  saveIncidentConfiguration(config: IncidentConfig): Promise<any> {
    let headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/incidentConfig/update', config, { headers } )
                    .toPromise();
  }



  deleteIncidentConfiguration(name: string): Promise<any> {
    let headers = this.buildHeaders();
    return this.http.delete(this.apiPath + `/incidentConfig/${name}`, { headers } )
                    .toPromise();
  }



  createInvestigation(incidentId, serverId): Promise<boolean> {
    let headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/createInvestigation', {incidentId, serverId}, { headers } )
                    .toPromise()
                    .then( (value: any) => value.success);
  }



  demistoIncidentImport(incidentId, serverId): Promise<DemistoIncidentImportResult> {
    let headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/demistoIncidentImport', {incidentId, serverId}, { headers } )
                    .toPromise()
                    .then( (res: DemistoIncidentImportResult) => res);
  }



  getPublicKey(): Promise<void> {
    let headers = this.buildHeaders();
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

}
