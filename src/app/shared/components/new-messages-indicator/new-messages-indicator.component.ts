import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatScrollService, NewMessagesInfo } from '@/services/chat-scroll.service';
import { Subject, takeUntil } from 'rxjs';

/**
 * NewMessagesIndicator - Shows when new messages arrive while user is browsing history
 * 
 * Displays a floating button at the bottom of the chat that:
 * - Shows the count of unread messages
 * - Clicking scrolls to the bottom and clears the indicator
 * - Animates in/out smoothly
 */
@Component({
  selector: 'app-new-messages-indicator',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (newMessages.visible && newMessages.count > 0) {
      <button 
        class="new-messages-indicator"
        (click)="onIndicatorClick()"
        [@slideUp]>
        <svg 
          class="arrow-icon" 
          width="16" 
          height="16" 
          viewBox="0 0 24 24" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg">
          <path 
            d="M7.41 8.59L12 13.17L16.59 8.59L18 10L12 16L6 10L7.41 8.59Z" 
            fill="currentColor"/>
        </svg>
        <span class="indicator-text">
          {{ newMessages.count }} new message{{ newMessages.count > 1 ? 's' : '' }}
        </span>
      </button>
    }
  `,
  styles: [`
    :host {
      display: block;
      position: absolute;
      bottom: 140px; /* Position above sticky input area */
      left: 50%;
      transform: translateX(-50%);
      z-index: 100;
      pointer-events: none;
    }

    .new-messages-indicator {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.625rem 1rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 24px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4), 
                  0 2px 8px rgba(0, 0, 0, 0.15);
      pointer-events: auto;
      animation: slideUp 0.3s ease-out, pulse 2s ease-in-out infinite;
      transition: transform 0.2s ease, box-shadow 0.2s ease;

      &:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5), 
                    0 4px 12px rgba(0, 0, 0, 0.2);
      }

      &:active {
        transform: scale(0.98);
      }

      .arrow-icon {
        animation: bounce 1s ease-in-out infinite;
      }

      .indicator-text {
        white-space: nowrap;
      }
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes bounce {
      0%, 100% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(3px);
      }
    }

    @keyframes pulse {
      0%, 100% {
        box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4), 
                    0 2px 8px rgba(0, 0, 0, 0.15);
      }
      50% {
        box-shadow: 0 4px 20px rgba(102, 126, 234, 0.6), 
                    0 2px 10px rgba(0, 0, 0, 0.2);
      }
    }

    @media (max-width: 768px) {
      :host {
        bottom: 120px; /* Adjust for smaller mobile input area */
      }

      .new-messages-indicator {
        font-size: 0.8125rem;
        padding: 0.5rem 0.875rem;
      }
    }
  `]
})
export class NewMessagesIndicatorComponent implements OnInit, OnDestroy {
  newMessages: NewMessagesInfo = { count: 0, visible: false };
  private destroy$ = new Subject<void>();

  constructor(
    private scrollService: ChatScrollService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.scrollService.newMessagesIndicator$
      .pipe(takeUntil(this.destroy$))
      .subscribe(info => {
        this.newMessages = info;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onIndicatorClick(): void {
    this.scrollService.scrollToBottom('smooth');
  }
}
