import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SignalRService } from '../../../services/signalr.service';
import { SignalRConnectionState } from '../../../models/chat.models';
import { Observable } from 'rxjs';

@Component({
    selector: 'app-signalr-status',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="signalr-status" *ngIf="(connectionState$ | async) as state">
      <div 
        class="status-indicator" 
        [class.connected]="state === ConnectionState.Connected"
        [class.connecting]="state === ConnectionState.Connecting"
        [class.reconnecting]="state === ConnectionState.Reconnecting"
        [class.disconnected]="state === ConnectionState.Disconnected"
        [title]="getStatusTitle(state)">
        <span class="status-dot"></span>
        <span class="status-text" *ngIf="state !== ConnectionState.Connected">
          {{ getStatusText(state) }}
        </span>
      </div>
    </div>
  `,
    styles: [`
    .signalr-status {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      transition: all 0.3s ease;
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      transition: background-color 0.3s ease;
    }

    .status-indicator.connected .status-dot {
      background-color: #10b981; /* Green */
      box-shadow: 0 0 4px rgba(16, 185, 129, 0.5);
    }

    .status-indicator.connecting .status-dot,
    .status-indicator.reconnecting .status-dot {
      background-color: #f59e0b; /* Amber */
      animation: pulse 1.5s ease-in-out infinite;
    }

    .status-indicator.disconnected .status-dot {
      background-color: #ef4444; /* Red */
    }

    .status-text {
      color: #6b7280;
      font-weight: 500;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }

    /* Auto-hide when connected */
    .status-indicator.connected {
      opacity: 0.5;
    }

    .status-indicator.connected:hover {
      opacity: 1;
    }
  `]
})
export class SignalRStatusComponent {
    private readonly signalrService = inject(SignalRService);

    connectionState$: Observable<SignalRConnectionState>;
    ConnectionState = SignalRConnectionState;

    constructor() {
        this.connectionState$ = this.signalrService.connectionState$;
    }

    getStatusText(state: SignalRConnectionState): string {
        switch (state) {
            case SignalRConnectionState.Connecting:
                return 'Connecting...';
            case SignalRConnectionState.Reconnecting:
                return 'Reconnecting...';
            case SignalRConnectionState.Disconnected:
                return 'Disconnected';
            case SignalRConnectionState.Connected:
                return 'Connected';
            default:
                return '';
        }
    }

    getStatusTitle(state: SignalRConnectionState): string {
        switch (state) {
            case SignalRConnectionState.Connected:
                return 'Real-time updates active';
            case SignalRConnectionState.Connecting:
                return 'Establishing connection...';
            case SignalRConnectionState.Reconnecting:
                return 'Attempting to reconnect...';
            case SignalRConnectionState.Disconnected:
                return 'Real-time updates unavailable';
            default:
                return '';
        }
    }
}
