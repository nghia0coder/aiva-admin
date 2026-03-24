import { Component, ElementRef, ViewChild, OnInit, OnDestroy, inject, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import {
  ChatMessage,
  Conversation,
  SuggestedPrompt,
  MessageDto
} from '@/models/chat.models';
import { ChatService } from '@/services/chat.service';
import { ChatScrollService } from '@/services/chat-scroll.service';
import { MarkdownPipe } from '@/shared/pipes/markdown.pipe';
import { ChatScrollDirective } from '@/shared/directives/chat-scroll.directive';
import { NewMessagesIndicatorComponent } from '@/shared/components/new-messages-indicator/new-messages-indicator.component';
import { StructuredTableComponent } from '@/shared/components/structured-table/structured-table.component';
import { ChartComponent } from '@/shared/components/chart/chart.component';
import { ActionMetadata, ActionEventData } from '@/models/structured-response.models';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MarkdownPipe,
    ChatScrollDirective,
    NewMessagesIndicatorComponent,
    StructuredTableComponent,
    ChartComponent
  ],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef;

  private readonly chatService = inject(ChatService);
  private readonly scrollService = inject(ChatScrollService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  userInput = '';
  isLoading = false;
  isSidebarCollapsed = false;
  currentModel = 'AIVA Pro';
  errorMessage = '';
  thinkingStatus = 'Thinking';

  private thinkingStages = [
    'Analyzing your question',
    'Processing context',
    'Generating response',
    'Thinking'
  ];
  private thinkingInterval: ReturnType<typeof setInterval> | null = null;

  conversations: Conversation[] = [];
  currentConversation: Conversation | null = null;
  isLoadingConversations = false;
  pagination = {
    currentPage: 1,
    perPage: 10,
    totalCount: 0,
    totalPages: 0,
    hasMore: false
  };

  suggestedPrompts: SuggestedPrompt[] = [
    {
      icon: '💡',
      title: 'Brainstorm ideas',
      description: 'for a new feature',
      prompt: 'Help me brainstorm ideas for implementing a new feature in my application'
    },
    {
      icon: '📝',
      title: 'Write code',
      description: 'for common tasks',
      prompt: 'Help me write clean, efficient code for a common programming task'
    },
    {
      icon: '🔍',
      title: 'Debug issues',
      description: 'in my codebase',
      prompt: 'Help me debug and fix issues in my code'
    },
    {
      icon: '📚',
      title: 'Explain concepts',
      description: 'in simple terms',
      prompt: 'Explain a complex programming concept in simple, easy-to-understand terms'
    }
  ];

  private currentStreamSubscription: { unsubscribe: () => void } | null = null;

  // Text streaming buffer system for smooth animation
  private textBuffer = '';
  private displayedText = '';
  private typewriterInterval: ReturnType<typeof setInterval> | null = null;
  private readonly TYPING_SPEED_MS = 15; // Milliseconds per character (lower = faster)
  private readonly CHARS_PER_TICK = 2; // Characters to reveal per tick
  private currentAssistantMessage: ChatMessage | null = null;

  ngOnInit(): void {
    this.updateConversations();
    this.updatePagination();
    this.loadConversations();

    // Check for conversationId in query params
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const conversationId = params['conversationId'];

        // Clear current conversation if conversationId changed or is null
        if (!conversationId || this.currentConversation?.id !== conversationId) {
          // Cancel any ongoing streams
          this.cancelStream();
          this.stopThinkingAnimation();
          this.isLoading = false;
          this.errorMessage = '';

          // Clear current conversation
          this.currentConversation = null;
        }

        if (conversationId) {
          // Try to find in existing conversations first
          const conversation = this.conversations.find(c => c.id === conversationId);
          if (conversation) {
            this.selectConversation(conversation);
          } else {
            // Create a temporary conversation object if we have the ID
            this.currentConversation = {
              id: conversationId,
              title: 'Loading...',
              messages: [],
              createdAt: new Date(),
              updatedAt: new Date()
            };
            this.selectConversation(this.currentConversation);
          }
        }
      });
  }

  ngAfterViewInit(): void {
    // Scroll service is now managed by the directive
    // Just ensure we start in "following" state for new conversations
    this.scrollService.setFollowingState();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.cancelStream();
    this.stopThinkingAnimation();
    this.stopTypewriter();
  }

  private startThinkingAnimation(): void {
    let stageIndex = 0;
    this.thinkingStatus = this.thinkingStages[stageIndex];

    this.thinkingInterval = setInterval(() => {
      stageIndex = (stageIndex + 1) % this.thinkingStages.length;
      this.thinkingStatus = this.thinkingStages[stageIndex];
    }, 2000);
  }

  private stopThinkingAnimation(): void {
    if (this.thinkingInterval) {
      clearInterval(this.thinkingInterval);
      this.thinkingInterval = null;
    }
    this.thinkingStatus = 'Thinking';
  }

  get hasMessages(): boolean {
    return this.currentConversation !== null && this.currentConversation.messages.length > 0;
  }

  get messages(): ChatMessage[] {
    return this.currentConversation?.messages || [];
  }

  private loadConversations(): void {
    if (!this.chatService.isConversationsLoaded()) {
      this.isLoadingConversations = true;
      this.chatService.getConversations(1, 10, false)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.isLoadingConversations = false;
          },
          error: () => {
            this.isLoadingConversations = false;
          }
        });
    }
  }

  private updateConversations(): void {
    this.chatService.conversations$
      .pipe(takeUntil(this.destroy$))
      .subscribe(conversations => {
        this.conversations = conversations;

        // Sync current conversation title and updatedAt with the list (which gets SignalR updates)
        if (this.currentConversation) {
          const updated = conversations.find(c => c.id === this.currentConversation?.id);
          if (updated) {
            if (updated.title !== this.currentConversation.title) {
              console.log(`Syncing currentConversation title: ${this.currentConversation.title} -> ${updated.title}`);
              this.currentConversation.title = updated.title;
            }
            if (updated.updatedAt > this.currentConversation.updatedAt) {
              this.currentConversation.updatedAt = updated.updatedAt;
            }
          }
        }
      });
  }

  private updatePagination(): void {
    this.chatService.pagination$
      .pipe(takeUntil(this.destroy$))
      .subscribe(pagination => {
        this.pagination = pagination;
      });
  }


  startNewChat(): void {
    this.chatService.createConversation('New Conversation')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (conversation) => {
          const newConv = this.conversations.find(c => c.id === conversation.conversationId);
          if (newConv) {
            this.currentConversation = newConv;
          } else {
            const now = new Date();
            this.currentConversation = {
              id: conversation.conversationId,
              title: conversation.title,
              messages: [],
              createdAt: now,
              updatedAt: now
            };
          }
          // Reset scroll state for new conversation
          this.scrollService.setFollowingState();
          this.scrollService.clearNewMessages();
        },
        error: (error) => {
          this.errorMessage = 'Failed to create conversation';
          console.error(error);
        }
      });
  }

  selectConversation(conversation: Conversation): void {
    this.currentConversation = conversation;
    this.errorMessage = '';

    // Reset scroll state and scroll to bottom
    this.scrollService.setFollowingState();
    this.scrollService.clearNewMessages();

    // Load messages if not already loaded
    if (conversation.messages.length === 0) {
      this.chatService.loadLatestMessages(conversation.id, 50)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (response.title) {
              conversation.title = response.title;
            }

            conversation.messages = response.messages
              .filter((m: MessageDto) => m.role === 'user' || m.role === 'assistant')
              .map((m: MessageDto) => this.mapMessageDtoToChatMessage(m));

            if (response.pagination) {
              conversation.messagePagination = response.pagination;
              conversation.messagesFullyLoaded = !response.pagination.hasMore && !response.pagination.hasNewer;
            }

            // Scroll to bottom after messages load
            setTimeout(() => this.scrollService.scrollToBottom('instant'), 0);
          },
          error: (error) => {
            console.error('Failed to load messages:', error);

            // Check if conversation doesn't exist
            if (error.status === 404 || error.message?.includes('not found') || error.message?.includes('does not exist')) {
              this.errorMessage = 'This conversation no longer exists. It may have been deleted.';
              this.currentConversation = null;

              // Navigate to empty state after a short delay
              setTimeout(() => {
                this.router.navigate(['/chat']);
              }, 2000);
            } else {
              this.errorMessage = 'Failed to load conversation messages.';
            }
          }
        });
    } else {
      // Messages already loaded, scroll to bottom
      setTimeout(() => this.scrollService.scrollToBottom('instant'), 0);
    }
  }

  deleteConversation(event: Event, conversation: Conversation): void {
    event.stopPropagation();
    this.chatService.deleteConversation(conversation.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          if (this.currentConversation?.id === conversation.id) {
            this.currentConversation = null;
          }
        },
        error: (error) => {
          this.errorMessage = 'Failed to delete conversation';
          console.error(error);
        }
      });
  }

  /**
   * Load older messages when user scrolls to the top
   */
  loadOlderMessages(): void {
    if (!this.currentConversation ||
      this.currentConversation.isLoadingOlderMessages ||
      !this.currentConversation.messagePagination?.hasMore) {
      return;
    }

    const oldestMessageId = this.currentConversation.messagePagination.oldestMessageId;
    if (!oldestMessageId) return;

    this.currentConversation.isLoadingOlderMessages = true;

    // Save current scroll position
    const container = this.messagesContainer?.nativeElement;
    const previousScrollHeight = container?.scrollHeight || 0;
    const previousScrollTop = container?.scrollTop || 0;

    this.chatService.loadOlderMessages(this.currentConversation.id, oldestMessageId, 50)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (!this.currentConversation) return;

          const olderMessages = response.messages
            .filter((m: MessageDto) => m.role === 'user' || m.role === 'assistant')
            .map((m: MessageDto) => this.mapMessageDtoToChatMessage(m));

          this.currentConversation.messages = [...olderMessages, ...this.currentConversation.messages];

          if (response.pagination) {
            this.currentConversation.messagePagination = response.pagination;
            this.currentConversation.messagesFullyLoaded = !response.pagination.hasMore && !response.pagination.hasNewer;
          }

          // Restore scroll position after DOM update
          setTimeout(() => {
            if (container) {
              const newScrollHeight = container.scrollHeight;
              const scrollDiff = newScrollHeight - previousScrollHeight;
              container.scrollTop = previousScrollTop + scrollDiff;
            }
          }, 0);

          this.currentConversation.isLoadingOlderMessages = false;
        },
        error: (error) => {
          console.error('Failed to load older messages:', error);
          if (this.currentConversation) {
            this.currentConversation.isLoadingOlderMessages = false;
          }
        }
      });
  }

  /**
   * Load newer messages when user scrolls to the bottom (if not at latest)
   */
  loadNewerMessages(): void {
    if (!this.currentConversation ||
      this.currentConversation.isLoadingNewerMessages ||
      !this.currentConversation.messagePagination?.hasNewer) {
      return;
    }

    const newestMessageId = this.currentConversation.messagePagination.newestMessageId;
    if (!newestMessageId) return;

    this.currentConversation.isLoadingNewerMessages = true;

    this.chatService.loadNewerMessages(this.currentConversation.id, newestMessageId, 50)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (!this.currentConversation) return;

          const newerMessages = response.messages
            .filter((m: MessageDto) => m.role === 'user' || m.role === 'assistant')
            .map((m: MessageDto) => this.mapMessageDtoToChatMessage(m));

          this.currentConversation.messages = [...this.currentConversation.messages, ...newerMessages];

          if (response.pagination) {
            this.currentConversation.messagePagination = response.pagination;
            this.currentConversation.messagesFullyLoaded = !response.pagination.hasMore && !response.pagination.hasNewer;
          }

          this.currentConversation.isLoadingNewerMessages = false;
        },
        error: (error) => {
          console.error('Failed to load newer messages:', error);
          if (this.currentConversation) {
            this.currentConversation.isLoadingNewerMessages = false;
          }
        }
      });
  }

  selectPrompt(prompt: SuggestedPrompt): void {
    this.userInput = prompt.prompt;
    this.sendMessage();
  }

  // Store the last modified table HTML to send with the next message
  private lastTableHtml = '';

  onTableHtmlChange(html: string): void {
    if (!html) return;
    console.log('ChatComponent: Table HTML Update Received, length:', html.length);
    this.lastTableHtml = html;
  }

  /**
   * Captures changes from inputs rendered inside standard content (innerHTML).
   * Since these are not Angular components, we must:
   * 1. Listen for events at the container level (Event Delegation).
   * 2. Manually sync the DOM property state to HTML attributes (because innerHTML reads attributes).
   * 3. Extract the modified HTML to send back to the server.
   */
  onDynamicContentChange(event: Event): void {
    const target = event.target as HTMLElement;

    // Only care about inputs inside tables (or any interactive element we want to track)
    const table = target.closest('table');
    if (!table) return;

    // Sync state to attributes so outerHTML captures the current value
    if (target instanceof HTMLInputElement) {
      if (target.type === 'checkbox') {
        if (target.checked) {
          target.setAttribute('checked', 'checked');
        } else {
          target.removeAttribute('checked');
        }
      } else {
        target.setAttribute('value', target.value);
      }
    } else if (target instanceof HTMLSelectElement) {
      // For select, we need to handle the selected attribute on options
      const options = Array.from(target.options);
      options.forEach(opt => {
        if (opt.selected) {
          opt.setAttribute('selected', 'selected');
        } else {
          opt.removeAttribute('selected');
        }
      });
    }

    // Capture the updated HTML of the table
    // This allows the backend to see the user's selections
    this.onTableHtmlChange(table.outerHTML);
  }

  async sendMessage(): Promise<void> {
    if (!this.userInput.trim() || this.isLoading) return;

    // Log previous state
    console.log('Sending message. Last Table HTML length:', this.lastTableHtml.length);
    if (!this.lastTableHtml) console.warn('Warning: lastTableHtml is empty');

    const messageContent = this.userInput.trim();
    this.userInput = '';
    this.errorMessage = '';

    // Create conversation if none exists
    if (!this.currentConversation) {
      try {
        const conversationDto = await firstValueFrom(
          this.chatService.createConversation('New Conversation')
        );

        if (conversationDto) {
          const now = new Date();
          this.currentConversation = {
            id: conversationDto.conversationId,
            title: conversationDto.title,
            messages: [],
            createdAt: now,
            updatedAt: now
          };
        }
      } catch (error) {
        this.errorMessage = 'Failed to create conversation';
        return;
      }
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: this.chatService.generateMessageId(),
      role: 'user',
      content: messageContent,
      timestamp: new Date()
    };

    this.currentConversation!.messages.push(userMessage);
    this.currentConversation!.updatedAt = new Date();

    // Create assistant message placeholder
    const assistantMessage: ChatMessage = {
      id: this.chatService.generateMessageId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true
    };

    this.currentConversation!.messages.push(assistantMessage);
    this.isLoading = true;
    this.startThinkingAnimation();

    // Sending a message is an explicit user intent to return to the latest.
    // Even if the user was browsing history, we should bring them back to bottom
    // to see their message + the assistant response.
    // Wait for DOM to render the new messages before scrolling
    this.scrollToBottomAfterRender();

    // Get the additional user data (table HTML) and clear it
    const additionalUserData = this.lastTableHtml;
    this.lastTableHtml = '';

    // Stream the response
    this.streamResponse(this.currentConversation!.id, messageContent, assistantMessage, additionalUserData);
  }

  private streamResponse(
    conversationId: string,
    message: string,
    assistantMessage: ChatMessage,
    additionalUserData?: string,
    images?: File[]
  ): void {
    this.cancelStream();

    // Reset buffer system
    this.textBuffer = '';
    this.displayedText = '';
    this.currentAssistantMessage = assistantMessage;
    this.startTypewriter();

    // Notify scroll service that streaming is starting
    this.scrollService.onStreamingStart();

    this.currentStreamSubscription = this.chatService.streamChat(conversationId, message, additionalUserData, images)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          // Handle different SSE event types
          switch (event.type) {
            case 'message':
              // Text content streaming
              if (event.data?.content) {
                this.stopThinkingAnimation();
                this.textBuffer += event.data.content;

                // Notify scroll service of streaming content
                this.scrollService.onStreamingContent();
              }
              break;

            case 'structured_data_start':
              // Initialize table with metadata and columns
              this.stopThinkingAnimation();
              assistantMessage.responseType = 'structured_table';
              assistantMessage.structuredData = {
                metadata: event.data.metadata,
                columns: event.data.columns,
                rows: [],
                globalActions: []
              };
              console.log('Table initialized:', event.data);
              break;

            case 'structured_data_row':
              // Add row progressively
              if (assistantMessage.structuredData) {
                assistantMessage.structuredData.rows.push(event.data);
                console.log('Row added:', event.data);

                // Notify scroll service for smooth scrolling
                this.scrollService.onStreamingContent();
              }
              break;

            case 'structured_data_complete':
              // Add global actions
              if (assistantMessage.structuredData) {
                assistantMessage.structuredData.globalActions = event.data.globalActions;
                console.log('Table complete with global actions:', event.data);
              }
              break;

            case 'chart':
              // Chart data streaming
              this.stopThinkingAnimation();
              assistantMessage.responseType = 'chart';
              // Backend wraps config in { config: {...}, chartType: "...", type: "chartjs" }
              assistantMessage.chartData = event.data.config || event.data;
              console.log('Chart received:', event.data);

              // Notify scroll service for smooth scrolling
              this.scrollService.onStreamingContent();
              break;

            case 'table':
              // Markdown table streaming
              this.stopThinkingAnimation();
              assistantMessage.responseType = 'markdown_table';
              assistantMessage.markdownTable = event.data.content;
              console.log('Markdown table received:', event.data);

              // Notify scroll service for smooth scrolling
              this.scrollService.onStreamingContent();
              break;

            case 'action':
              // Handle structured actions (e.g., redirect)
              this.stopThinkingAnimation();
              this.handleAction(event.data);
              break;

            case 'done':
              // Stream completion - handled in complete callback
              break;

            case 'error':
              // Error event
              console.error('Stream error event:', event.data);
              break;
          }
        },
        error: (error) => {
          console.error('Stream error:', error);
          this.stopThinkingAnimation();
          this.flushBuffer(assistantMessage);
          assistantMessage.isStreaming = false;

          // Check if conversation was deleted/not found
          if (error.status === 404 || error.message?.includes('not found') || error.message?.includes('does not exist')) {
            assistantMessage.error = 'This conversation no longer exists. It may have been deleted.';
            this.errorMessage = 'Conversation not found. Redirecting...';

            // Remove the assistant message placeholder
            if (this.currentConversation) {
              const index = this.currentConversation.messages.indexOf(assistantMessage);
              if (index > -1) {
                this.currentConversation.messages.splice(index, 1);
              }
            }

            // Navigate to empty state after a short delay
            setTimeout(() => {
              this.router.navigate(['/chat']);
            }, 2000);
          } else {
            assistantMessage.error = error.message || 'Failed to get response';
            this.errorMessage = 'Failed to send message. Please try again.';
          }

          this.isLoading = false;
          this.scrollService.onStreamingEnd();
        },
        complete: () => {
          this.stopThinkingAnimation();
          this.finishStreaming(assistantMessage);
        }
      });
  }

  private startTypewriter(): void {
    if (this.typewriterInterval) return;

    this.typewriterInterval = setInterval(() => {
      if (this.textBuffer.length > this.displayedText.length) {
        const remainingChars = this.textBuffer.length - this.displayedText.length;
        const charsToAdd = Math.min(this.CHARS_PER_TICK, remainingChars);

        const nextChars = this.textBuffer.substring(
          this.displayedText.length,
          this.displayedText.length + charsToAdd
        );

        this.displayedText += nextChars;

        if (this.currentAssistantMessage) {
          this.currentAssistantMessage.content = this.displayedText;

          // Notify scroll service of content update
          this.scrollService.onStreamingContent();
        }
      }
    }, this.TYPING_SPEED_MS);
  }

  private stopTypewriter(): void {
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = null;
    }
  }

  private flushBuffer(assistantMessage: ChatMessage): void {
    this.stopTypewriter();
    assistantMessage.content = this.textBuffer;
    this.displayedText = this.textBuffer;
    this.textBuffer = '';
    this.currentAssistantMessage = null;
  }

  private finishStreaming(assistantMessage: ChatMessage): void {
    const checkComplete = () => {
      if (this.displayedText.length >= this.textBuffer.length) {
        this.stopTypewriter();
        assistantMessage.content = this.textBuffer;
        assistantMessage.isStreaming = false;
        this.isLoading = false;
        this.textBuffer = '';
        this.displayedText = '';
        this.currentAssistantMessage = null;
        this.chatService.updateConversationLocally(this.currentConversation!);

        // Notify scroll service that streaming ended
        this.scrollService.onStreamingEnd();
      } else {
        setTimeout(checkComplete, 50);
      }
    };
    checkComplete();
  }

  private cancelStream(): void {
    if (this.currentStreamSubscription) {
      this.currentStreamSubscription.unsubscribe();
      this.currentStreamSubscription = null;
    }
    this.stopTypewriter();
  }

  stopGeneration(): void {
    this.cancelStream();
    this.stopThinkingAnimation();
    this.stopTypewriter();
    this.isLoading = false;

    const lastMessage = this.currentConversation?.messages[this.currentConversation.messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant') {
      if (this.textBuffer) {
        lastMessage.content = this.displayedText || this.textBuffer;
      }
      lastMessage.isStreaming = false;
    }

    this.textBuffer = '';
    this.displayedText = '';
    this.currentAssistantMessage = null;

    this.scrollService.onStreamingEnd();
  }

  copyMessage(message: ChatMessage): void {
    navigator.clipboard.writeText(message.content).then(() => {
      // Could add toast notification here
    });
  }

  private mapMessageDtoToChatMessage(m: MessageDto): ChatMessage {
    const message: ChatMessage = {
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: new Date(m.createdAt)
    };

    // Handle structured data if present
    const structuredData = m.structuredData as any;

    // Check for chart in structuredData (from JSON example)
    if (structuredData && structuredData.type === 'chart' && structuredData.chartConfig) {
      message.responseType = 'chart';
      try {
        message.chartData = typeof structuredData.chartConfig === 'string'
          ? JSON.parse(structuredData.chartConfig)
          : structuredData.chartConfig;
      } catch (e) {
        console.error('Failed to parse chart config:', e);
      }

      // Use textResponse if available to avoid duplication in content (which often contains the table markdown)
      if (structuredData.textResponse) {
        message.content = structuredData.textResponse;
      }

      // Also potentially handle markdown table if we want to show it
      if (structuredData.markdownTable) {
        message.markdownTable = structuredData.markdownTable;
      }
    }
    // Handle standard structured table
    else if (m.responseType && m.responseType.name === 'Structured' && m.structuredData) {
      message.responseType = 'structured_table';
      message.structuredData = m.structuredData;
    }
    // Handle chart data legacy/explicit type
    else if (m.responseType && m.responseType.name === 'Chart' && (m as any).chartData) {
      message.responseType = 'chart';
      message.chartData = (m as any).chartData;
    }

    return message;
  }

  /**
   * Handle action clicks from structured table (e.g., Add to Cart, View Detail)
   */
  onActionClick(action: ActionMetadata): void {
    if (action.isDisabled) {
      console.warn('Action is disabled:', action.disabledReason);
      // Could show a toast notification here
      return;
    }

    console.log('Action clicked:', action);

    // TODO: Implement actual action handling based on action.type
    // For now, just log the action. In a real implementation, you would:
    // 1. Make HTTP request to action.endpoint with action.method
    // 2. Pass action.params as request body/query params
    // 3. Show success/error notifications
    // 4. Update UI state (e.g., cart count, wishlist, etc.)

    // Example implementation:
    // this.http.request(action.method, action.endpoint, { body: action.params })
    //   .subscribe({
    //     next: (response) => {
    //       console.log('Action succeeded:', response);
    //       // Show success toast
    //     },
    //     error: (error) => {
    //       console.error('Action failed:', error);
    //       // Show error toast
    //     }
    //   });
  }

  regenerateResponse(message: ChatMessage): void {
    if (!this.currentConversation || this.isLoading) return;

    this.stopTypewriter();
    this.textBuffer = '';
    this.displayedText = '';
    this.currentAssistantMessage = null;

    const messageIndex = this.currentConversation.messages.findIndex(m => m.id === message.id);
    if (messageIndex > -1) {
      const userMessage = this.currentConversation.messages[messageIndex - 1];
      if (userMessage && userMessage.role === 'user') {
        this.currentConversation.messages.splice(messageIndex, 1);

        const newAssistantMessage: ChatMessage = {
          id: this.chatService.generateMessageId(),
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          isStreaming: true
        };

        this.currentConversation.messages.push(newAssistantMessage);
        this.isLoading = true;
        this.startThinkingAnimation();

        this.streamResponse(
          this.currentConversation.id,
          userMessage.content,
          newAssistantMessage
        );
      }
    }
  }

  /**
   * Handle sidebar toggle - preserve scroll position
   */
  toggleSidebar(): void {
    // Capture scroll state before layout change
    this.scrollService.beforeLayoutChange();

    this.isSidebarCollapsed = !this.isSidebarCollapsed;

    // Use requestAnimationFrame to wait for layout to settle
    // This is more reliable than setTimeout as it waits for the next paint
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Double RAF ensures layout is fully complete
        this.scrollService.afterLayoutChange();
      });
    });
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  formatDate(date: Date): string {
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  }

  /**
   * Scroll to bottom after DOM has rendered new messages
   * Only scrolls if user is NOT already at the bottom
   * Uses polling to check when scrollHeight changes, indicating DOM is ready
   */
  private scrollToBottomAfterRender(maxAttempts: number = 10): void {
    const container = this.messagesContainer?.nativeElement;
    if (!container) {
      // Fallback: try after a delay
      setTimeout(() => {
        if (!this.scrollService.isFollowing) {
          this.scrollService.scrollToBottom('smooth');
        }
      }, 100);
      return;
    }

    // Check if user is already at bottom before adding messages
    const wasAtBottom = this.scrollService.isFollowing;

    // If already at bottom, don't scroll - let auto-scroll handle it
    if (wasAtBottom) {
      return;
    }

    const initialScrollHeight = container.scrollHeight;
    let attempts = 0;

    const checkAndScroll = () => {
      attempts++;
      const currentScrollHeight = container.scrollHeight;

      // If scrollHeight changed, DOM has rendered - scroll now
      if (currentScrollHeight > initialScrollHeight || attempts >= maxAttempts) {
        // Double-check: only scroll if still not at bottom
        if (!this.scrollService.isFollowing) {
          this.scrollService.scrollToBottom('smooth');
        }
        return;
      }

      // Otherwise, check again on next frame
      requestAnimationFrame(checkAndScroll);
    };

    // Start checking after Angular change detection cycle
    requestAnimationFrame(() => {
      requestAnimationFrame(checkAndScroll);
    });
  }

  /**
   * Handles structured actions received from the backend
   */
  private handleAction(data: ActionEventData): void {
    const { actionType, payload } = data;
    console.log('ChatComponent: Action received:', actionType, payload);

    switch (actionType) {
      case 'redirect':
        const url = payload.url;
        const delay = parseInt(payload.delay || '0');

        console.log(`ChatComponent: Opening ${url} in a new tab in ${delay}ms...`);

        setTimeout(() => {
          // Open in a new tab
          window.open(url, '_blank');
        }, delay);
        break;

      default:
        console.warn('ChatComponent: Unknown action type:', actionType);
    }
  }
}
