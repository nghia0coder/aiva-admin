import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, Subject, fromEvent, Subscription } from 'rxjs';
import { throttleTime, distinctUntilChanged } from 'rxjs/operators';

/**
 * Scroll State for the chat panel
 * - 'following': User is at/near bottom, auto-scroll is enabled
 * - 'browsing': User has scrolled up, auto-scroll is disabled
 */
export type ChatScrollState = 'following' | 'browsing';

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  distanceFromBottom: number;
  isAtBottom: boolean;
}

export interface NewMessagesInfo {
  count: number;
  visible: boolean;
}

/**
 * ChatScrollService - Manages scroll state for the chat panel
 * 
 * This service implements the scroll behavior contract:
 * 1. Auto-scroll only when user intends to follow conversation
 * 2. Never steal scroll control when user is reading history
 * 3. Provide explicit control to return to latest message
 * 
 * Architecture:
 * - Scroll Observation Layer: Reads scroll position
 * - Scroll State Layer: Determines following vs browsing
 * - Behavior Layer: Auto-scroll, pause, show indicators
 */
@Injectable({
  providedIn: 'root'
})
export class ChatScrollService {
  // Threshold in pixels to consider "at bottom"
  // Accounts for floating point inaccuracies and small content changes
  private readonly BOTTOM_THRESHOLD = 100;

  // Throttle scroll events for performance (ms)
  private readonly SCROLL_THROTTLE_MS = 50;

  // Scroll state
  private scrollState$ = new BehaviorSubject<ChatScrollState>('following');
  private scrollMetrics$ = new BehaviorSubject<ScrollMetrics | null>(null);

  // New messages indicator
  private newMessages$ = new BehaviorSubject<NewMessagesInfo>({ count: 0, visible: false });

  // Scroll events
  private scrollToBottom$ = new Subject<{ behavior: ScrollBehavior }>();

  // Streaming state
  private isStreaming$ = new BehaviorSubject<boolean>(false);
  private wasFollowingAtStreamStart = true;

  // Throttle streaming scroll operations to prevent thrashing
  private lastStreamScrollTime = 0;
  private readonly STREAM_SCROLL_THROTTLE_MS = 100; // Max 10 scrolls/second during streaming

  // Container reference and subscription
  private scrollContainer: HTMLElement | null = null;
  private scrollSubscription: Subscription | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Layout change tracking for sidebar toggle handling
  private preLayoutScrollState: { wasAtBottom: boolean; relativePosition: number } | null = null;

  constructor(private ngZone: NgZone) { }

  // ============================================
  // PUBLIC API - Observables
  // ============================================

  /**
   * Current scroll state (following/browsing)
   */
  get state$(): Observable<ChatScrollState> {
    return this.scrollState$.asObservable();
  }

  /**
   * Current scroll state value
   */
  get currentState(): ChatScrollState {
    return this.scrollState$.getValue();
  }

  /**
   * Whether user is at bottom (following conversation)
   */
  get isFollowing(): boolean {
    return this.scrollState$.getValue() === 'following';
  }

  /**
   * New messages indicator info
   */
  get newMessagesIndicator$(): Observable<NewMessagesInfo> {
    return this.newMessages$.asObservable();
  }

  /**
   * Scroll to bottom events
   */
  get scrollToBottomRequest$(): Observable<{ behavior: ScrollBehavior }> {
    return this.scrollToBottom$.asObservable();
  }

  /**
   * Current scroll metrics
   */
  get metrics$(): Observable<ScrollMetrics | null> {
    return this.scrollMetrics$.asObservable();
  }

  // ============================================
  // PUBLIC API - Actions
  // ============================================

  /**
   * Register the scroll container element
   * Call this when the chat messages container is initialized
   */
  registerContainer(container: HTMLElement): void {
    this.unregisterContainer();
    this.scrollContainer = container;

    // Run scroll listener outside Angular for better performance
    this.ngZone.runOutsideAngular(() => {
      this.scrollSubscription = fromEvent(container, 'scroll')
        .pipe(throttleTime(this.SCROLL_THROTTLE_MS, undefined, { leading: true, trailing: true }))
        .subscribe(() => this.handleScroll());
    });

    // Set up ResizeObserver to detect content height changes
    this.setupResizeObserver(container);

    // Initial measurement
    this.handleScroll();
  }

  /**
   * Unregister the scroll container
   * Call this on component destroy
   */
  unregisterContainer(): void {
    if (this.scrollSubscription) {
      this.scrollSubscription.unsubscribe();
      this.scrollSubscription = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.scrollContainer = null;
  }

  /**
   * Request scroll to bottom
   * @param behavior 'smooth' or 'instant'
   */
  scrollToBottom(behavior: ScrollBehavior = 'smooth'): void {
    this.scrollToBottom$.next({ behavior });
    this.clearNewMessages();
    this.setFollowingState();
  }

  /**
   * Notify that a new message was received
   * Handles auto-scroll logic based on current state
   */
  onNewMessage(): void {
    if (this.isFollowing) {
      // User is following - auto-scroll
      this.scrollToBottom('smooth');
    } else {
      // User is browsing - increment indicator
      this.incrementNewMessages();
    }
  }

  /**
   * Notify that streaming has started
   * Captures current scroll state to determine auto-scroll behavior
   */
  onStreamingStart(): void {
    this.isStreaming$.next(true);
    this.wasFollowingAtStreamStart = this.isFollowing;
    this.lastStreamScrollTime = 0; // Reset throttle timer for immediate first scroll
  }

  /**
   * Notify that new streaming content was received
   * Auto-scrolls only if user was following at stream start and hasn't scrolled up
   * Throttled to prevent scroll thrashing during rapid updates
   */
  onStreamingContent(): void {
    if (!this.wasFollowingAtStreamStart || !this.isFollowing) {
      return;
    }

    // Throttle scroll operations during streaming
    const now = Date.now();
    if (now - this.lastStreamScrollTime >= this.STREAM_SCROLL_THROTTLE_MS) {
      this.scrollToBottom('instant');
      this.lastStreamScrollTime = now;
    }
  }

  /**
   * Notify that streaming has ended
   */
  onStreamingEnd(): void {
    this.isStreaming$.next(false);
    // Final scroll if user was following
    if (this.wasFollowingAtStreamStart && this.isFollowing) {
      this.scrollToBottom('smooth');
    }
  }

  /**
   * Clear the new messages indicator
   */
  clearNewMessages(): void {
    this.newMessages$.next({ count: 0, visible: false });
  }

  /**
   * Prepare for layout change (sidebar toggle)
   * Call BEFORE the layout change occurs
   */
  beforeLayoutChange(): void {
    if (!this.scrollContainer) return;

    const metrics = this.getScrollMetrics();
    if (!metrics) return;

    this.preLayoutScrollState = {
      wasAtBottom: metrics.isAtBottom,
      // Store relative position (0-1) for restoration
      relativePosition: metrics.scrollHeight > 0
        ? metrics.scrollTop / (metrics.scrollHeight - metrics.clientHeight)
        : 0
    };
  }

  /**
   * Handle layout change completion (sidebar toggle)
   * Call AFTER the layout change has settled
   */
  afterLayoutChange(): void {
    if (!this.scrollContainer || !this.preLayoutScrollState) return;

    // Wait for reflow to complete
    requestAnimationFrame(() => {
      if (!this.scrollContainer || !this.preLayoutScrollState) return;

      if (this.preLayoutScrollState.wasAtBottom) {
        // Re-anchor to bottom
        this.scrollToBottom('instant');
      } else {
        // Preserve relative scroll position
        const newScrollHeight = this.scrollContainer.scrollHeight;
        const newClientHeight = this.scrollContainer.clientHeight;
        const maxScroll = newScrollHeight - newClientHeight;

        if (maxScroll > 0) {
          this.scrollContainer.scrollTop = this.preLayoutScrollState.relativePosition * maxScroll;
        }
      }

      this.preLayoutScrollState = null;
    });
  }

  /**
   * Force state to following (e.g., when starting a new conversation)
   */
  setFollowingState(): void {
    this.ngZone.run(() => {
      this.scrollState$.next('following');
    });
  }

  /**
   * Force state to browsing (e.g., when user explicitly scrolls up)
   */
  setBrowsingState(): void {
    this.ngZone.run(() => {
      this.scrollState$.next('browsing');
    });
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private handleScroll(): void {
    const metrics = this.getScrollMetrics();
    if (!metrics) return;

    this.ngZone.run(() => {
      this.scrollMetrics$.next(metrics);

      // Determine new state based on scroll position
      const newState: ChatScrollState = metrics.isAtBottom ? 'following' : 'browsing';

      if (newState !== this.scrollState$.getValue()) {
        this.scrollState$.next(newState);

        // If user scrolled up during streaming, stop auto-scroll
        if (newState === 'browsing' && this.isStreaming$.getValue()) {
          this.wasFollowingAtStreamStart = false;
        }

        // Clear indicator when user scrolls to bottom
        if (newState === 'following') {
          this.clearNewMessages();
        }
      }
    });
  }

  private getScrollMetrics(): ScrollMetrics | null {
    if (!this.scrollContainer) return null;

    const { scrollTop, scrollHeight, clientHeight } = this.scrollContainer;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom <= this.BOTTOM_THRESHOLD;

    return {
      scrollTop,
      scrollHeight,
      clientHeight,
      distanceFromBottom,
      isAtBottom
    };
  }

  /**
   * Set up ResizeObserver to detect content height changes
   * Auto-scrolls when content grows if user is following
   */
  private setupResizeObserver(container: HTMLElement): void {
    if (typeof ResizeObserver === 'undefined') {
      return; // ResizeObserver not supported
    }

    this.resizeObserver = new ResizeObserver(() => {
      // Only auto-scroll if following and streaming
      if (this.isFollowing && this.isStreaming$.getValue()) {
        this.ngZone.run(() => {
          this.scrollToBottom('instant');
        });
      }
    });

    this.resizeObserver.observe(container);
  }

  private incrementNewMessages(): void {
    const current = this.newMessages$.getValue();
    this.newMessages$.next({
      count: current.count + 1,
      visible: true
    });
  }
}
