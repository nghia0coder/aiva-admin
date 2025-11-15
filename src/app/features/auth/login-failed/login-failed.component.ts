import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-login-failed',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './login-failed.component.html',
  styleUrls: ['./login-failed.component.scss']
})
export class LoginFailedComponent {
}

