import { Component, OnInit, inject } from '@angular/core';

import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { InteractionStatus } from '@azure/msal-browser';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  isLoading = false;

  ngOnInit(): void {
    // Check if already authenticated
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    }

    // Listen for interaction status
    this.authService.getInteractionStatus()
      .pipe(filter((status: InteractionStatus) => status === InteractionStatus.None))
      .subscribe(() => {
        this.isLoading = false;
        if (this.authService.isAuthenticated()) {
          this.router.navigate(['/dashboard']);
        }
      });
  }

  login(): void {
    this.isLoading = true;
    this.authService.login();
  }
}

