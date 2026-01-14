import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ChatService } from '@/services/chat.service';
import { Conversation } from '@/models/chat.models';

@Component({
  selector: 'app-chat-history-sidebar',
  standalone: true,
  imports: [CommonModule],
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
  ) {}

  ngOnInit(): void {
    this.chatService.getConversations(1, 10, false).subscribe();
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
