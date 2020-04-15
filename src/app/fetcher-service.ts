import { Injectable } from '@angular/core';
import { HttpHeaders, HttpClient } from '@angular/common/http';
import { User } from './types/user';
import { ApiStatus } from './types/api-status';
import { FetchedIncidentField } from './types/fetched-incident-field';
import { FetchedIncidentType } from './types/fetched-incident-types';
import { FieldConfig, FieldsConfig } from './types/fields-config';
import { DemistoAPI, DemistoAPIEndpoints } from './types/demisto-properties';
import { DefaultApiServer } from './types/default-api-server';
import { ImportFromDemisto } from './types/import-from-demisto';
import * as JSEncrypt from 'jsencrypt';

@Injectable({providedIn: 'root'})

export class FetcherService {

  constructor( private http: HttpClient ) {}

  // demistoProperties: DemistoProperties; // gets set during test
  apiPath = '/api';
  currentUser: User;
  private publicKey: string;
  encryptor: JSEncrypt.JSEncrypt;



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
    console.log('logResult:', res);
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



  testApiServer(serverId: string): Promise<ApiStatus> {
    let headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    return this.http.get(`${this.apiPath}/demistoApi/test/${encodeURIComponent(serverId)}`, { headers } )
                    .toPromise()
                    .then( (status: ApiStatus) => status );
  }



  testApiServerAdhoc(serverParams: DemistoAPI): Promise<ApiStatus> {
    if ('apiKey' in serverParams) {
      serverParams.apiKey = this.encrypt(serverParams.apiKey);
    }
    let headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    return this.http.post(`${this.apiPath}/demistoApi/test/adhoc`, serverParams, { headers } )
                    .toPromise()
                    .then( (status: ApiStatus) => status );
  }



  getDemistoApi(): Promise<DemistoAPIEndpoints> {
    let headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    return this.http.get(this.apiPath + '/demistoApi', { headers } )
                    .toPromise()
                    .then( (endpoints: DemistoAPIEndpoints) => endpoints );
  }



  setDemistoDefaultApi(serverId): Promise<ApiStatus> {
    let headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    const body = { serverId };
    return this.http.post(this.apiPath + '/demistoApi/default', body, { headers } )
                    .toPromise()
                    .then( res => res as ApiStatus );
  }



  getDemistoDefaultApi(): Promise<DefaultApiServer> {
    let headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    return this.http.get(this.apiPath + '/demistoApi/default', { headers } )
                    .toPromise()
                    .then( res => res as DefaultApiServer);
  }



  createDemistoApi(url, apiKey, trustAny): Promise<ApiStatus> {
    let headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    let body = { url, apiKey: this.encrypt(apiKey), trustAny };
    return this.http.post(this.apiPath + '/demistoApi', body, { headers } )
                    .toPromise()
                    .then( res => res as ApiStatus );
  }



  updateDemistoApi(serverId, url, trustAny, apiKey?): Promise<ApiStatus> {
    let headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    let body = { url, trustAny, serverId };
    if (apiKey) {
      body['apiKey'] = this.encrypt(apiKey);
    }
    return this.http.post(this.apiPath + '/demistoApi/update', body, { headers } )
                    .toPromise()
                    .then( res => res as ApiStatus );
  }



  deleteDemistoApi(serverId): Promise<ApiStatus> {
    let headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    serverId = encodeURIComponent(serverId);
    console.log('deleteDemistoApi(): serverId:', serverId);
    return this.http.delete(`${this.apiPath}/demistoApi/${serverId}`, { headers } )
                    .toPromise()
                    .then( res => res as ApiStatus );
  }



  createDemistoIncident( params: any ): Promise<any> {
    let headers = this.buildHeaders(this.currentUser.username);
    console.log('Current User: ', this.currentUser.username);
    return this.http.post(this.apiPath + '/createDemistoIncident', params, { headers } )
                    .toPromise();
  }



  getIncidentFieldDefinitions(serverId): Promise<FetchedIncidentField[]> {
    serverId = encodeURIComponent(serverId);
    let headers = this.buildHeaders();
    return this.http.get(`${this.apiPath}/incidentfields/${serverId}`, { headers } )
                    .toPromise()
                    .then( (res: any) => res.incident_fields );
  }



  getIncidentTypes(serverId): Promise<FetchedIncidentType[]> {
    serverId = encodeURIComponent(serverId);
    let headers = this.buildHeaders();
    return this.http.get(`${this.apiPath}/incidenttype/${serverId}`, { headers } )
                    .toPromise()
                    // .then( (res: any) => this.logResult(res) )
                    .then( (res: any) => res.incident_types as FetchedIncidentType[] );
  }



  getSampleIncident(): Promise<any> {
    let headers = this.buildHeaders();
    return this.http.get(this.apiPath + '/sampleincident', { headers } )
                    .toPromise();
  }



  getAllFieldConfigurations(): Promise<FieldsConfig> {
    let headers = this.buildHeaders();
    return this.http.get(this.apiPath + '/fieldConfig/all', { headers } )
                    .toPromise()
                    .then(value => value as FieldsConfig);
  }



  saveNewFieldConfiguration(config: FieldConfig): Promise<any> {
    let headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/fieldConfig', config, { headers } )
                    .toPromise();
  }



  saveFieldConfiguration(config: FieldConfig): Promise<any> {
    let headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/fieldConfig/update', config, { headers } )
                    .toPromise();
  }



  deleteFieldConfiguration(name: string): Promise<any> {
    let headers = this.buildHeaders();
    return this.http.delete(this.apiPath + `/fieldConfig/${name}`, { headers } )
                    .toPromise();
  }



  createInvestigation(incidentId, serverId): Promise<boolean> {
    let headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/createInvestigation', {incidentId, serverId}, { headers } )
                    .toPromise()
                    .then( (value: any) => value.success);
  }



  demistoIncidentImport(incidentId, serverId): Promise<ImportFromDemisto> {
    let headers = this.buildHeaders();
    return this.http.post(this.apiPath + '/demistoIncidentImport', {incidentId, serverId}, { headers } )
                    .toPromise()
                    .then( (res: ImportFromDemisto) => res);
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
