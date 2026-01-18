import { Component, ElementRef, ViewChild, AfterViewChecked, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import {
  ChatMessage,
  Conversation,
  SuggestedPrompt,
  StreamChatResponse
} from '@/models/chat.models';
import { ChatService } from '@/services/chat.service';
import { MarkdownPipe } from '@/shared/pipes/markdown.pipe';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownPipe],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef;
  @ViewChild('conversationsList') private conversationsList!: ElementRef;

  private readonly chatService = inject(ChatService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy$ = new Subject<void>();
  private readonly DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant for E-Commerce websites. You are able to answer questions and help with tasks.';

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
  private thinkingInterval: any = null;

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

  private shouldScrollToBottom = false;
  private currentStreamSubscription: any = null;

  // Text streaming buffer system for smooth animation
  private textBuffer = '';
  private displayedText = '';
  private typewriterInterval: any = null;
  private readonly TYPING_SPEED_MS = 15; // Milliseconds per character (lower = faster)
  private readonly CHARS_PER_TICK = 2; // Characters to reveal per tick
  private currentAssistantMessage: ChatMessage | null = null;

  ngOnInit(): void {
    this.updateConversations();
    this.updatePagination();
    this.loadConversations();
    this.setupInfiniteScroll();

    // Check for conversationId in query params
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const conversationId = params['conversationId'];
        if (conversationId) {
          // Try to find in existing conversations first
          const conversation = this.conversations.find(c => c.id === conversationId);
          if (conversation) {
            this.selectConversation(conversation);
          } else {
            // If not found (e.g. reload), we might need to fetch it or wait for conversations to load
            // For now, let's look it up in the service's current value directly in case this.conversations isn't synced yet
            // or we can rely on the updateConversations subscription to handle it eventually if we set a flag,
            // but simpler is to just try to select it if it appears in the list later or just try to get messages if we have ID.

            // A better approach if not found is to try to load it specifically or wait.
            // But since we just created it in sidebar, it should be in the service state.

            // Let's create a temporary conversation object if we have the ID, so we can send messages
            // The full object will eventually update
            this.currentConversation = {
              id: conversationId,
              title: 'Loading...',
              messages: [],
              createdAt: new Date(),
              updatedAt: new Date()
            };
            // And load its messages to be sure
            this.selectConversation(this.currentConversation);
          }
        }
      });
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
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
    // Only load if conversations haven't been loaded yet
    // This prevents redundant API calls since the global sidebar already loads them
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
      });
  }

  private updatePagination(): void {
    this.chatService.pagination$
      .pipe(takeUntil(this.destroy$))
      .subscribe(pagination => {
        this.pagination = pagination;
      });
  }

  loadMoreConversations(): void {
    if (this.isLoadingConversations || !this.pagination.hasMore) return;

    this.isLoadingConversations = true;
    this.chatService.loadMoreConversations()
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

  private setupInfiniteScroll(): void {
    // Use IntersectionObserver for better performance
    if (typeof IntersectionObserver !== 'undefined') {
      // Observer will be set up after view init
      setTimeout(() => {
        if (this.conversationsList) {
          const listElement = this.conversationsList.nativeElement;

          // Create a sentinel element for intersection observation
          // We'll observe when user scrolls near the bottom
          const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting && !this.isLoadingConversations && this.pagination.hasMore) {
                this.loadMoreConversations();
              }
            });
          }, {
            root: listElement,
            rootMargin: '200px', // Load more when 200px from bottom
            threshold: 0.1
          });

          // Observe scroll behavior on the list itself
          // We'll check scroll position manually for better control
          listElement.addEventListener('scroll', () => {
            this.handleScroll(listElement);
          });
        }
      }, 100);
    }
  }

  private handleScroll(element: HTMLElement): void {
    if (this.isLoadingConversations || !this.pagination.hasMore) return;

    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;

    // Load more when user scrolls within 300px of the bottom
    const threshold = 300;
    if (scrollHeight - scrollTop - clientHeight < threshold) {
      this.loadMoreConversations();
    }
  }

  startNewChat(): void {
    this.chatService.createConversation('New Conversation', this.DEFAULT_SYSTEM_PROMPT)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (conversation) => {
          const newConv = this.conversations.find(c => c.id === conversation.conversationId);
          if (newConv) {
            this.currentConversation = newConv;
          } else {
            // If not found in list yet, create it directly
            const now = new Date();
            this.currentConversation = {
              id: conversation.conversationId,
              title: conversation.title,
              messages: [],
              createdAt: now,
              updatedAt: now
            };
          }
        },
        error: (error) => {
          this.errorMessage = 'Failed to create conversation';
          console.error(error);
        }
      });
  }

  selectConversation(conversation: Conversation): void {
    this.currentConversation = conversation;
    this.shouldScrollToBottom = true;

    // Load messages if not already loaded
    if (conversation.messages.length === 0) {
      this.chatService.getMessages(conversation.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (messages) => {
            conversation.messages = messages.map(m => ({
              id: m.id,
              role: m.role,
              content: m.content,
              timestamp: new Date(m.createdAt)
            }));
            this.shouldScrollToBottom = true;
          }
        });
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

  selectPrompt(prompt: SuggestedPrompt): void {
    this.userInput = prompt.prompt;
    this.sendMessage();
  }

  async sendMessage(): Promise<void> {
    if (!this.userInput.trim() || this.isLoading) return;

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
          // Use the returned DTO directly instead of finding from array
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
    this.shouldScrollToBottom = true;


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

    // Stream the response
    this.streamResponse(this.currentConversation!.id, messageContent, assistantMessage);
  }

  private streamResponse(
    conversationId: string,
    message: string,
    assistantMessage: ChatMessage
  ): void {
    this.cancelStream(); // Cancel any existing stream

    // Reset buffer system
    this.textBuffer = '';
    this.displayedText = '';
    this.currentAssistantMessage = assistantMessage;
    this.startTypewriter();

    this.currentStreamSubscription = this.chatService.streamChat(conversationId, message)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: StreamChatResponse) => {
          if (response.content) {
            // Stop thinking animation on first chunk received
            this.stopThinkingAnimation();
            // Add to buffer instead of directly to content
            this.textBuffer += response.content;
          }
        },
        error: (error) => {
          console.error('Stream error:', error);
          this.stopThinkingAnimation();
          // Flush remaining buffer on error
          this.flushBuffer(assistantMessage);
          assistantMessage.isStreaming = false;
          assistantMessage.error = error.message || 'Failed to get response';
          this.isLoading = false;
        },
        complete: () => {
          this.stopThinkingAnimation();
          // Wait for buffer to finish, then complete
          this.finishStreaming(assistantMessage);
        }
      });
  }

  private startTypewriter(): void {
    if (this.typewriterInterval) return;

    this.typewriterInterval = setInterval(() => {
      if (this.textBuffer.length > this.displayedText.length) {
        // Calculate how many chars to add this tick
        const remainingChars = this.textBuffer.length - this.displayedText.length;
        const charsToAdd = Math.min(this.CHARS_PER_TICK, remainingChars);

        // Get next characters from buffer
        const nextChars = this.textBuffer.substring(
          this.displayedText.length,
          this.displayedText.length + charsToAdd
        );

        this.displayedText += nextChars;

        // Update the message content
        if (this.currentAssistantMessage) {
          this.currentAssistantMessage.content = this.displayedText;
          this.shouldScrollToBottom = true;
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
    // Immediately display all buffered content
    this.stopTypewriter();
    assistantMessage.content = this.textBuffer;
    this.displayedText = this.textBuffer;
    this.textBuffer = '';
    this.currentAssistantMessage = null;
  }

  private finishStreaming(assistantMessage: ChatMessage): void {
    // Check if buffer is fully displayed
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
      } else {
        // Check again after a short delay
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

    // Mark the last assistant message as not streaming and flush buffer
    const lastMessage = this.currentConversation?.messages[this.currentConversation.messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant') {
      // Keep whatever was displayed so far
      if (this.textBuffer) {
        lastMessage.content = this.displayedText || this.textBuffer;
      }
      lastMessage.isStreaming = false;
    }

    // Reset buffer
    this.textBuffer = '';
    this.displayedText = '';
    this.currentAssistantMessage = null;
  }

  copyMessage(message: ChatMessage): void {
    navigator.clipboard.writeText(message.content).then(() => {
      // Could add toast notification here
    });
  }

  regenerateResponse(message: ChatMessage): void {
    if (!this.currentConversation || this.isLoading) return;

    // Reset any existing buffer
    this.stopTypewriter();
    this.textBuffer = '';
    this.displayedText = '';
    this.currentAssistantMessage = null;

    const messageIndex = this.currentConversation.messages.findIndex(m => m.id === message.id);
    if (messageIndex > -1) {
      // Get the previous user message
      const userMessage = this.currentConversation.messages[messageIndex - 1];
      if (userMessage && userMessage.role === 'user') {
        // Remove the current response
        this.currentConversation.messages.splice(messageIndex, 1);

        // Create new assistant message
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

        // Stream new response
        this.streamResponse(
          this.currentConversation.id,
          userMessage.content,
          newAssistantMessage
        );
      }
    }
  }

  toggleSidebar(): void {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
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

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const element = this.messagesContainer.nativeElement;
      // Use smooth scrolling for better UX during streaming
      element.scrollTo({
        top: element.scrollHeight,
        behavior: 'smooth'
      });
    }
  }
}