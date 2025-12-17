import { Component, inject } from '@angular/core';

import { RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent {
  private readonly authService = inject(AuthService);

  isMenuOpen = false;

  get userName(): string {
    return this.authService.getUserDisplayName();
  }

  get userEmail(): string {
    return this.authService.getUserEmail();
  }

  get userInitials(): string {
    const name = this.userName;
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  logout(): void {
    this.isMenuOpen = false;
    this.authService.logout();
  }

  closeMenu(): void {
    this.isMenuOpen = false;
  }
}

