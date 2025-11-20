import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent {
  conversations = [
    { id: 1, name: 'General Discussion', lastMessage: 'Hello team!', time: '10:30 AM', unread: 3 },
    { id: 2, name: 'Project Updates', lastMessage: 'New deployment completed', time: '09:15 AM', unread: 0 },
    { id: 3, name: 'Support Team', lastMessage: 'How can I help you?', time: 'Yesterday', unread: 1 }
  ];

  selectedConversation = this.conversations[0];

  messages = [
    { id: 1, sender: 'John Doe', content: 'Hello team!', time: '10:30 AM', isOwn: false },
    { id: 2, sender: 'You', content: 'Hi John! How are you?', time: '10:32 AM', isOwn: true },
    { id: 3, sender: 'John Doe', content: 'I am doing great, thanks for asking!', time: '10:33 AM', isOwn: false }
  ];

  selectConversation(conversation: any): void {
    this.selectedConversation = conversation;
  }
}

