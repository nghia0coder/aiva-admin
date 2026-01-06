import { ApplicationConfig, inject, provideAppInitializer, provideZoneChangeDetection, PLATFORM_ID } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideHttpClient, withInterceptorsFromDi, withFetch } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { routes } from './app.routes';
import { environment } from '../environments/environment';
import {
  IPublicClientApplication,
  PublicClientApplication,
  InteractionType,
  BrowserCacheLocation,
  LogLevel
} from '@azure/msal-browser';
import {
  MsalGuard,
  MsalInterceptor,
  MsalBroadcastService,
  MsalInterceptorConfiguration,
  MsalService,
  MSAL_GUARD_CONFIG,
  MSAL_INSTANCE,
  MSAL_INTERCEPTOR_CONFIG,
  MsalGuardConfiguration
} from '@azure/msal-angular';
import { HTTP_INTERCEPTORS } from '@angular/common/http';

/**
 * Here we pass the configuration parameters to create an MSAL instance.
 * For more info, visit: https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-angular/docs/v2-docs/configuration.md
 */
export function MSALInstanceFactory(): IPublicClientApplication {
  return new PublicClientApplication({
    auth: {
      clientId: environment.msalConfig.auth.clientId,
      authority: environment.msalConfig.auth.authority,
      redirectUri: environment.msalConfig.auth.redirectUri,
      postLogoutRedirectUri: environment.msalConfig.auth.postLogoutRedirectUri
    },
    cache: {
      cacheLocation: BrowserCacheLocation.LocalStorage,
      storeAuthStateInCookie: false, // Set to true for IE 11
    },
    system: {
      loggerOptions: {
        loggerCallback: (level: LogLevel, message: string, containsPii: boolean): void => {
          if (containsPii) {
            return;
          }

          if (!environment.production) {
            return;
          }

          switch (level) {
            case LogLevel.Error:
              console.error('[MSAL]', message);
              return;
            case LogLevel.Warning:
              console.warn('[MSAL]', message);
              return;
            case LogLevel.Info:
            case LogLevel.Verbose:
              return;
          }
        },
        logLevel: LogLevel.Info,
        piiLoggingEnabled: false
      }
    }
  });
}

/**
 * Set your default interaction type for MSALGuard here. If you have any
 * additional scopes you want the user to consent upon login, add them here as well.
 */
export function MSALGuardConfigFactory(): MsalGuardConfiguration {
  return {
    interactionType: InteractionType.Redirect,
    authRequest: {
      scopes: [...environment.apiConfig.scopes]
    },
    loginFailedRoute: '/login-failed'
  };
}

/**
 * MSAL Angular will automatically retrieve tokens for resources 
 * added to protectedResourceMap. For more info, visit:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-angular/docs/v2-docs/initialization.md#get-tokens-for-web-api-calls
 * 
 * The interceptor will automatically:
 * - Attach access tokens to requests matching protectedResourceMap URLs
 * - Refresh tokens silently when they expire
 * - Handle token acquisition errors gracefully
 */
export function MSALInterceptorConfigFactory(): MsalInterceptorConfiguration {
  const protectedResourceMap = new Map<string, Array<string>>();

  // Map API base URL with all its sub-paths to required scopes
  // MSAL will match any URL that starts with this base URL
  const apiBaseUrl = environment.apiConfig.baseUrl;
  protectedResourceMap.set(apiBaseUrl, environment.apiConfig.scopes);

  // Also add base URL with trailing slash to ensure all paths are covered
  if (!apiBaseUrl.endsWith('/')) {
    protectedResourceMap.set(`${apiBaseUrl}/`, environment.apiConfig.scopes);
  }

  // Map Microsoft Graph API
  protectedResourceMap.set('https://graph.microsoft.com/v1.0/me', ['user.read']);
  protectedResourceMap.set('https://graph.microsoft.com', ['user.read']);

  return {
    // Use Redirect for silent token refresh (best practice for production)
    // This will automatically redirect to login if token refresh fails
    interactionType: InteractionType.Redirect,
    protectedResourceMap
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideHttpClient(
      withInterceptorsFromDi(),
      withFetch()
    ),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: MsalInterceptor,
      multi: true
    },
    {
      provide: MSAL_INSTANCE,
      useFactory: MSALInstanceFactory
    },
    {
      provide: MSAL_GUARD_CONFIG,
      useFactory: MSALGuardConfigFactory
    },
    {
      provide: MSAL_INTERCEPTOR_CONFIG,
      useFactory: MSALInterceptorConfigFactory
    },
    MsalService,
    MsalGuard,
    MsalBroadcastService,
    provideAppInitializer(() => {
      const platformId = inject(PLATFORM_ID);

      // Only initialize MSAL on browser
      if (!isPlatformBrowser(platformId)) {
        return Promise.resolve();
      }

      const msalService = inject(MsalService);
      return msalService.instance.initialize().then(() => {
        return msalService.instance.handleRedirectPromise().then((result) => {
          if (result) {
            msalService.instance.setActiveAccount(result.account);
          }
        });
      });
    })
  ]
};
