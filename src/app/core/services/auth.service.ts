import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { MsalService, MsalBroadcastService } from '@azure/msal-angular';
import {
  AuthenticationResult,
  InteractionStatus,
  EventMessage,
} from '@azure/msal-browser';
import { Observable, Subject, filter } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly msalService = inject(MsalService);
  private readonly msalBroadcastService = inject(MsalBroadcastService);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly _destroying$ = new Subject<void>();

  constructor() {
    this.initializeMsal();
  }

  /**
   * Initialize MSAL and handle redirect promise
   */
  private initializeMsal(): void {
    // Only initialize on browser
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.msalService.instance.initialize().then(() => {
      this.msalService.instance.handleRedirectPromise().then((result: AuthenticationResult | null) => {
        if (result) {
          this.msalService.instance.setActiveAccount(result.account);
        }
      }).catch((error) => {
        console.error('Error during redirect:', error);
      });
    });
  }

  /**
   * Login with redirect
   */
  login(): void {
    this.msalService.loginRedirect();
  }

  /**
   * Login with popup
   */
  loginPopup(): Observable<AuthenticationResult> {
    return new Observable(observer => {
      this.msalService.loginPopup()
        .subscribe({
          next: (result: AuthenticationResult) => {
            this.msalService.instance.setActiveAccount(result.account);
            observer.next(result);
            observer.complete();
          },
          error: (error) => {
            console.error('Login failed:', error);
            observer.error(error);
          }
        });
    });
  }

  /**
   * Logout
   */
  logout(): void {
    this.msalService.logoutRedirect();
  }

  /**
   * Logout with popup
   */
  logoutPopup(): void {
    this.msalService.logoutPopup();
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    // During SSR, always return false
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }
    return this.msalService.instance.getAllAccounts().length > 0;
  }

  /**
   * Get the active account
   */
  getActiveAccount() {
    return this.msalService.instance.getActiveAccount();
  }

  /**
   * Get all accounts
   */
  getAllAccounts() {
    return this.msalService.instance.getAllAccounts();
  }

  /**
   * Get interaction status observable
   */
  getInteractionStatus(): Observable<InteractionStatus> {
    return this.msalBroadcastService.inProgress$;
  }

  /**
   * Get MSAL events observable
   */
  getMsalEvents(): Observable<EventMessage> {
    return this.msalBroadcastService.msalSubject$;
  }

  /**
   * Acquire token silently
   */
  acquireTokenSilent(scopes: string[]): Observable<AuthenticationResult> {
    const account = this.getActiveAccount();

    if (!account) {
      throw new Error('No active account! Please login first.');
    }

    return new Observable(observer => {
      this.msalService.acquireTokenSilent({
        scopes,
        account
      }).subscribe({
        next: (result: AuthenticationResult) => {
          observer.next(result);
          observer.complete();
        },
        error: (error) => {
          console.error('Token acquisition failed:', error);
          observer.error(error);
        }
      });
    });
  }

  /**
   * Get user display name
   */
  getUserDisplayName(): string {
    const account = this.getActiveAccount();
    return account?.name || account?.username || 'User';
  }

  /**
   * Get user email
   */
  getUserEmail(): string {
    const account = this.getActiveAccount();
    return account?.username || '';
  }

  /**
   * Cleanup on destroy
   */
  destroy(): void {
    this._destroying$.next(undefined);
    this._destroying$.complete();
  }
}

