import { Component, ElementRef, ViewChild, AfterViewChecked, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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

  private readonly chatService = inject(ChatService);
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

  ngOnInit(): void {
    this.loadConversations();
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
    this.chatService.getConversations()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.chatService.conversations$
            .pipe(takeUntil(this.destroy$))
            .subscribe(conversations => {
              this.conversations = conversations;
            });
        }
      });
  }

  startNewChat(): void {
    this.chatService.createConversation('New Conversation', this.DEFAULT_SYSTEM_PROMPT)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (conversation) => {
          const newConv = this.conversations.find(c => c.id === conversation.conversationId);
          if (newConv) {
            this.currentConversation = newConv;
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
          this.chatService.createConversation(messageContent.substring(0, 40))
        );

        if (conversationDto) {
          // Use the returned DTO directly instead of finding from array
          this.currentConversation = {
            id: conversationDto.conversationId,
            title: conversationDto.title,
            messages: [],
            createdAt: new Date(conversationDto.createdAt),
            updatedAt: new Date(conversationDto.updatedAt)
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

    // Update conversation title if first message
    if (this.currentConversation!.messages.length === 1) {
      this.currentConversation!.title = messageContent.substring(0, 40) +
        (messageContent.length > 40 ? '...' : '');
    }

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

    this.currentStreamSubscription = this.chatService.streamChat(conversationId, message)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: StreamChatResponse) => {
          if (response.content) {
            // Stop thinking animation on first chunk received
            this.stopThinkingAnimation();
            assistantMessage.content += response.content;
            this.shouldScrollToBottom = true;
          }
        },
        error: (error) => {
          console.error('Stream error:', error);
          this.stopThinkingAnimation();
          assistantMessage.isStreaming = false;
          assistantMessage.error = error.message || 'Failed to get response';
          this.isLoading = false;
        },
        complete: () => {
          this.stopThinkingAnimation();
          assistantMessage.isStreaming = false;
          this.isLoading = false;
          this.chatService.updateConversationLocally(this.currentConversation!);
        }
      });
  }

  private cancelStream(): void {
    if (this.currentStreamSubscription) {
      this.currentStreamSubscription.unsubscribe();
      this.currentStreamSubscription = null;
    }
  }

  stopGeneration(): void {
    this.cancelStream();
    this.stopThinkingAnimation();
    this.isLoading = false;

    // Mark the last assistant message as not streaming
    const lastMessage = this.currentConversation?.messages[this.currentConversation.messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant') {
      lastMessage.isStreaming = false;
    }
  }

  copyMessage(message: ChatMessage): void {
    navigator.clipboard.writeText(message.content).then(() => {
      // Could add toast notification here
    });
  }

  regenerateResponse(message: ChatMessage): void {
    if (!this.currentConversation || this.isLoading) return;

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
      element.scrollTop = element.scrollHeight;
    }
  }
}