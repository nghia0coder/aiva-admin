import { Directive, ElementRef, OnInit, OnDestroy, Output, EventEmitter, Input, NgZone } from '@angular/core';
import { ChatScrollService } from '@/services/chat-scroll.service';
import { Subject, takeUntil } from 'rxjs';

/**
 * ChatScrollDirective - Handles scroll behavior for the chat messages container
 * 
 * Usage:
 * ```html
 * <div class="messages-area" appChatScroll 
 *      (scrolledNearTop)="loadOlderMessages()"
 *      (scrolledNearBottom)="loadNewerMessages()">
 * ```
 * 
 * This directive:
 * 1. Registers the element with ChatScrollService
 * 2. Handles scroll-to-bottom requests
 * 3. Emits events when user scrolls near boundaries (for infinite scroll)
 */
@Directive({
  selector: '[appChatScroll]',
  standalone: true
})
export class ChatScrollDirective implements OnInit, OnDestroy {
  // Threshold for triggering boundary events (pixels from edge)
  @Input() scrollThreshold = 200;
  
  // Emit when user scrolls near the top (for loading older messages)
  @Output() scrolledNearTop = new EventEmitter<void>();
  
  // Emit when user scrolls near the bottom (for loading newer messages)
  @Output() scrolledNearBottom = new EventEmitter<void>();

  private destroy$ = new Subject<void>();
  private lastScrollTop = 0;
  private scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private el: ElementRef<HTMLElement>,
    private scrollService: ChatScrollService,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    // Register this element as the scroll container
    this.scrollService.registerContainer(this.el.nativeElement);

    // Subscribe to scroll-to-bottom requests
    this.scrollService.scrollToBottomRequest$
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ behavior }) => {
        this.scrollToBottom(behavior);
      });

    // Set up boundary scroll detection (debounced)
    this.setupBoundaryDetection();
  }

  ngOnDestroy(): void {
    this.scrollService.unregisterContainer();
    this.destroy$.next();
    this.destroy$.complete();
    
    if (this.scrollDebounceTimer) {
      clearTimeout(this.scrollDebounceTimer);
    }
  }

  private scrollToBottom(behavior: ScrollBehavior): void {
    const element = this.el.nativeElement;
    
    // Use requestAnimationFrame for smooth, performant scrolling
    requestAnimationFrame(() => {
      element.scrollTo({
        top: element.scrollHeight,
        behavior
      });
    });
  }

  private setupBoundaryDetection(): void {
    const element = this.el.nativeElement;

    this.ngZone.runOutsideAngular(() => {
      element.addEventListener('scroll', () => {
        // Debounce boundary checks
        if (this.scrollDebounceTimer) {
          clearTimeout(this.scrollDebounceTimer);
        }

        this.scrollDebounceTimer = setTimeout(() => {
          this.checkBoundaries();
        }, 150);
      });
    });
  }

  private checkBoundaries(): void {
    const element = this.el.nativeElement;
    const { scrollTop, scrollHeight, clientHeight } = element;
    const scrollingUp = scrollTop < this.lastScrollTop;
    const scrollingDown = scrollTop > this.lastScrollTop;

    // Check if near top (scrolling up)
    if (scrollTop < this.scrollThreshold && scrollingUp) {
      this.ngZone.run(() => this.scrolledNearTop.emit());
    }

    // Check if near bottom (scrolling down)
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    if (distanceFromBottom < this.scrollThreshold && scrollingDown) {
      this.ngZone.run(() => this.scrolledNearBottom.emit());
    }

    this.lastScrollTop = scrollTop;
  }
}
