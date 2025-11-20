import { Component, OnInit, OnDestroy, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { HeaderComponent } from '../../shared/layout/header/header.component';
import { Subject, takeUntil } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface UserProfile {
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  jobTitle?: string;
  officeLocation?: string;
  mobilePhone?: string;
  businessPhones?: string[];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, HeaderComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroy$ = new Subject<void>();

  userProfile: UserProfile | null = null;
  isLoadingProfile = false;
  profileError: string | null = null;

  ngOnInit(): void {
    // Only load profile on browser
    if (isPlatformBrowser(this.platformId)) {
      this.loadUserProfile();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadUserProfile(): void {
    this.isLoadingProfile = true;
    this.profileError = null;

    this.http.get<UserProfile>(environment.apiConfig.uri)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (profile) => {
          this.userProfile = profile;
          this.isLoadingProfile = false;
        },
        error: (error) => {
          console.error('Error loading user profile:', error);
          this.profileError = 'Failed to load user profile. Please try again.';
          this.isLoadingProfile = false;
        }
      });
  }

  get userName(): string {
    return this.authService.getUserDisplayName();
  }

  get userEmail(): string {
    return this.authService.getUserEmail();
  }
}

