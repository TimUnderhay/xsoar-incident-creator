import { Component } from '@angular/core';

@Component({
  selector: 'vertical-center',
  template: `
<div class="verticalCenter">

  <div></div>

  <div>
    <ng-content></ng-content>
  </div>

  <div></div>
</div>
`
})

export class VerticalCenterComponent {}
