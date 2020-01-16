import { Injectable } from '@angular/core';
import { Subject, BehaviorSubject, Subscription } from 'rxjs';
import { HttpHeaders, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DemistoProperties } from './types/demisto-properties';
import { User } from './types/user';
import { ApiStatus } from './types/api-status';

@Injectable()

export class FetcherService {

  constructor( private http: HttpClient ) {}



  demistoProperties: DemistoProperties; // gets set during test
  apiPath = '/api';
  currentUser: User;


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



  getApiStatus(): Promise<ApiStatus> {
    let headers = new HttpHeaders( {
      Accept: 'application/json'
    } );
    return this.http.get(this.apiPath + '/apiStatus', { headers } )
                    .toPromise()
                    .then( (status: ApiStatus) => status );
  }



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



  testDemisto( demistoProperties: DemistoProperties ): Promise<any> {
    this.demistoProperties = demistoProperties;
    let headers = this.buildHeaders();
    // headers = headers.append('Authorization', this.demistoProperties.apiKey);
    return this.http.post(this.apiPath + '/testConnect', demistoProperties, { headers } )
                    .toPromise();
  }



  createDemistoIncident( params: any ): Promise<any> {
    let headers = this.buildHeaders(this.currentUser.username);
    console.log('Current User: ', this.currentUser.username);
    return this.http.post(this.apiPath + '/createDemistoIncident', params, { headers } )
                    .toPromise();
  }



  getIncidentFields(): Promise<any> {
    let headers = this.buildHeaders();
    return this.http.get(this.apiPath + '/incidentfields', { headers } )
                    .toPromise();
  }



  getSampleIncident(): Promise<any> {
    let headers = this.buildHeaders();
    return this.http.get(this.apiPath + '/sampleincident', { headers } )
                    .toPromise();
  }

}
