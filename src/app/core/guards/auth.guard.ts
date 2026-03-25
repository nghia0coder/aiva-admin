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

  const accounts = msalService.instance.getAllAccounts();
  const isAuthenticated = accounts.length > 0;

  if (!isAuthenticated) {
    // Redirect to login page
    router.navigate(['/login']);
    return false;
  }

  // Gatekeeper: Check if user is from SIU or the specifically allowed personal account
  const account = accounts[0];
  const email = account.username?.toLowerCase() || '';
  
  const isSiuUser = email.endsWith('@siu.edu.vn');
  const isAllowedPersonalUser = email === 'nghiadai.2004work@gmail.com';

  if (!isSiuUser && !isAllowedPersonalUser) {
    console.warn('Unauthorized access attempt:', email);
    // Redirect to login if not authorized
    router.navigate(['/login']);
    return false;
  }

  return true;
};

