import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { MsalService } from '@azure/msal-angular';

export const authGuard: CanActivateFn = (route, state) => {
  const msalService = inject(MsalService);
  const router = inject(Router);

  const isAuthenticated = msalService.instance.getAllAccounts().length > 0;

  if (!isAuthenticated) {
    // Redirect to login page
    router.navigate(['/login']);
    return false;
  }

  return true;
};

