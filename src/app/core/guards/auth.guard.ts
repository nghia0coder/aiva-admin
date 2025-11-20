import { inject, PLATFORM_ID } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { MsalService } from '@azure/msal-angular';

export const authGuard: CanActivateFn = (route, state) => {
  const msalService = inject(MsalService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  // Skip authentication check during SSR
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const isAuthenticated = msalService.instance.getAllAccounts().length > 0;

  if (!isAuthenticated) {
    // Redirect to login page
    router.navigate(['/login']);
    return false;
  }

  return true;
};

