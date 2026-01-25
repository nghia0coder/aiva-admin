import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ChatService } from '@/services/chat.service';
import { Conversation } from '@/models/chat.models';
import { TypingTextComponent } from '@/shared/components/typing-text/typing-text.component';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-chat-history-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, TypingTextComponent],
  templateUrl: './chat-history-sidebar.component.html',
  styleUrls: ['./chat-history-sidebar.component.scss']
})
export class ChatHistorySidebarComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  get chatConversations$() {
    return this.chatService.conversations$;
  }

  get pagination$() {
    return this.chatService.pagination$;
  }

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private chatService: ChatService
  ) { }

  isLoading = false;
  editingConversationId: string | null = null;
  editingTitle: string = '';
  deletingConversationId: string | null = null;
  selectedConversationId: string | null = null;
  
  // Delete modal state
  showDeleteModal = false;
  conversationToDelete: Conversation | null = null;

  ngOnInit(): void {
    this.isLoading = true;
    this.chatService.getConversations(1, 10, false)
      .subscribe({
        next: () => this.isLoading = false,
        error: () => this.isLoading = false
      });

    // Track the current conversation from query params
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.selectedConversationId = params['conversationId'] || null;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  createNewChat(): void {
    this.chatService.createConversation('New Conversation', 'You are a helpful assistant for E-Commerce websites.')
      .subscribe({
        next: (conversation) => {
          this.router.navigate(['/chat'], { queryParams: { conversationId: conversation.conversationId } });
        },
        error: (error) => {
          console.error('Failed to create conversation:', error);
        }
      });
  }

  selectConversation(conversation: Conversation): void {
    this.router.navigate(['/chat'], { queryParams: { conversationId: conversation.id } });
  }

  loadMore(): void {
    this.chatService.loadMoreConversations().subscribe();
  }

  startEditingTitle(event: Event, conversation: Conversation): void {
    event.stopPropagation();
    this.editingConversationId = conversation.id;
    this.editingTitle = conversation.title;
  }

  saveTitle(event: Event, conversationId: string): void {
    event.stopPropagation();
    
    // Validate title
    const trimmedTitle = this.editingTitle.trim();
    if (!trimmedTitle || trimmedTitle.length < 1 || trimmedTitle.length > 200) {
      console.error('Title must be between 1 and 200 characters');
      this.cancelEdit();
      return;
    }

    this.chatService.updateConversationTitleManually(conversationId, trimmedTitle)
      .subscribe({
        next: () => {
          this.editingConversationId = null;
          this.editingTitle = '';
        },
        error: (error) => {
          console.error('Failed to update title:', error);
          this.cancelEdit();
        }
      });
  }

  cancelEdit(): void {
    this.editingConversationId = null;
    this.editingTitle = '';
  }

  onTitleInputKeydown(event: KeyboardEvent, conversationId: string): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.saveTitle(event, conversationId);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEdit();
    }
  }

  isEditing(conversationId: string): boolean {
    return this.editingConversationId === conversationId;
  }

  openDeleteModal(event: Event, conversation: Conversation): void {
    event.stopPropagation();
    this.conversationToDelete = conversation;
    this.showDeleteModal = true;
  }

  closeDeleteModal(): void {
    this.showDeleteModal = false;
    this.conversationToDelete = null;
  }

  confirmDelete(): void {
    if (!this.conversationToDelete) {
      return;
    }

    const conversationId = this.conversationToDelete.id;
    const wasSelectedConversation = this.selectedConversationId === conversationId;
    this.deletingConversationId = conversationId;
    
    this.chatService.deleteConversation(conversationId)
      .subscribe({
        next: () => {
          this.deletingConversationId = null;
          this.closeDeleteModal();
          console.log('Conversation deleted successfully');
          
          // Navigate away if the deleted conversation was selected
          if (wasSelectedConversation) {
            this.navigateAfterDelete();
          }
        },
        error: (error) => {
          console.error('Failed to delete conversation:', error);
          this.deletingConversationId = null;
          this.closeDeleteModal();
        }
      });
  }

  private navigateAfterDelete(): void {
    // Approach #1: Navigate to most recent conversation (if available)
    // Approach #2: Navigate to empty state (fallback)
    
    // Small delay to ensure the service state is updated after deletion
    setTimeout(() => {
      // Get current conversations from the service (already updated after deletion)
      this.chatService.conversations$.pipe(
        takeUntil(this.destroy$)
      ).subscribe(conversations => {
        if (conversations && conversations.length > 0) {
          // Navigate to the most recent (first) conversation
          const mostRecentConversation = conversations[0];
          this.router.navigate(['/chat'], { 
            queryParams: { conversationId: mostRecentConversation.id },
            queryParamsHandling: 'merge'
          });
          console.log(`Navigated to most recent conversation: ${mostRecentConversation.title}`);
        } else {
          // No conversations left, navigate to empty chat state
          this.router.navigate(['/chat'], {
            queryParams: { conversationId: null },
            queryParamsHandling: 'merge'
          });
          console.log('No conversations remaining, navigated to empty chat state');
        }
      }).unsubscribe(); // Immediately unsubscribe after getting current value
    }, 100);
  }

  isDeleting(conversationId: string): boolean {
    return this.deletingConversationId === conversationId;
  }

  isSelected(conversationId: string): boolean {
    return this.selectedConversationId === conversationId;
  }
}
