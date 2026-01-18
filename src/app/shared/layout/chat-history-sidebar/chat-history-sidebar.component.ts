import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ChatService } from '@/services/chat.service';
import { Conversation } from '@/models/chat.models';
import { TypingTextComponent } from '@/shared/components/typing-text/typing-text.component';

@Component({
  selector: 'app-chat-history-sidebar',
  standalone: true,
  imports: [CommonModule, TypingTextComponent],
  templateUrl: './chat-history-sidebar.component.html',
  styleUrls: ['./chat-history-sidebar.component.scss']
})
export class ChatHistorySidebarComponent implements OnInit {
  get chatConversations$() {
    return this.chatService.conversations$;
  }

  get pagination$() {
    return this.chatService.pagination$;
  }

  constructor(
    private router: Router,
    private chatService: ChatService
  ) { }

  isLoading = false;

  ngOnInit(): void {
    this.isLoading = true;
    this.chatService.getConversations(1, 10, false)
      .subscribe({
        next: () => this.isLoading = false,
        error: () => this.isLoading = false
      });
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
}
