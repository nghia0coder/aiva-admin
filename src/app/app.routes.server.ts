import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'chat',
    renderMode: RenderMode.Client // Client-side only due to API dependency
  },
  {
    path: 'dashboard',
    renderMode: RenderMode.Client // Client-side only due to potential API dependency
  },
  {
    path: 'storage',
    renderMode: RenderMode.Client // Client-side only due to potential API dependency
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
