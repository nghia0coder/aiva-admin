import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MsalService, MsalBroadcastService } from '@azure/msal-angular';
import { InteractionStatus } from '@azure/msal-browser';
import { Subject, filter, takeUntil } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class App implements OnInit, OnDestroy {
  protected title = 'aiva-admin';

  private readonly msalService = inject(MsalService);
  private readonly msalBroadcastService = inject(MsalBroadcastService);
  private readonly destroying$ = new Subject<void>();

  ngOnInit(): void {
    // Subscribe to interaction status changes
    this.msalBroadcastService.inProgress$
      .pipe(
        filter((status: InteractionStatus) => status === InteractionStatus.None),
        takeUntil(this.destroying$)
      )
      .subscribe(() => {
        this.setActiveAccount();
      });
  }

  ngOnDestroy(): void {
    this.destroying$.next(undefined);
    this.destroying$.complete();
  }

  private setActiveAccount(): void {
    const accounts = this.msalService.instance.getAllAccounts();

    if (accounts.length > 0) {
      this.msalService.instance.setActiveAccount(accounts[0]);
    }
  }
}
