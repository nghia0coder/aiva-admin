import { Injectable, inject } from '@angular/core';
import { Observable, BehaviorSubject, catchError, of, tap } from 'rxjs';
import {
    StreamChatRequest,
    StreamChatResponse,
    Conversation,
    ConversationDto,
    MessageDto,
    CreateConversationRequest,
} from '../models/chat.models';
import { ApiService } from '../core/http/api.service';

@Injectable({ providedIn: 'root' })
export class ChatService {
    private readonly api = inject(ApiService);

    // API endpoints
    private readonly endpoints = {
        streamChat: (conversationId: string) => `/conversations/${conversationId}/stream`,
        conversations: '/conversations',
        messages: (conversationId: string) => `/conversations/${conversationId}/messages`
    };

    // State management
    private conversationsSubject = new BehaviorSubject<Conversation[]>([]);
    conversations$ = this.conversationsSubject.asObservable();

    /**
     * Stream chat response from AI
     */
    streamChat(conversationId: string, message: string): Observable<StreamChatResponse> {
        const request: StreamChatRequest = {
            conversationId,
            message
        };

        return this.api.stream<StreamChatResponse>(this.endpoints.streamChat(conversationId), request);
    }

    /**
     * Create a new conversation
     */
    createConversation(title?: string, systemPrompt?: string): Observable<ConversationDto> {
        const request: CreateConversationRequest = { title, systemPrompt };

        return this.api.post<CreateConversationRequest, ConversationDto>(
            this.endpoints.conversations,
            request
        ).pipe(
            tap(conversation => {
                const current = this.conversationsSubject.value;
                const newConversation: Conversation = {
                    id: conversation.conversationId,
                    title: conversation.title,
                    messages: [],
                    createdAt: new Date(conversation.createdAt),
                    updatedAt: new Date(conversation.updatedAt)
                };
                this.conversationsSubject.next([newConversation, ...current]);
            })
        );
    }

    /**
     * Get all conversations
     */
    getConversations(): Observable<ConversationDto[]> {
        return this.api.get<ConversationDto[]>(this.endpoints.conversations).pipe(
            tap(conversations => {
                const mapped: Conversation[] = conversations.map(c => ({
                    id: c.conversationId,
                    title: c.title,
                    messages: [],
                    createdAt: new Date(c.createdAt),
                    updatedAt: new Date(c.updatedAt)
                }));
                this.conversationsSubject.next(mapped);
            }),
            catchError(error => {
                console.error('Failed to load conversations:', error);
                return of([]);
            })
        );
    }

    /**
     * Get messages for a conversation
     */
    getMessages(conversationId: string): Observable<MessageDto[]> {
        return this.api.get<MessageDto[]>(this.endpoints.messages(conversationId));
    }

    /**
     * Delete a conversation
     */
    deleteConversation(conversationId: string): Observable<void> {
        return this.api.delete<void>(`${this.endpoints.conversations}/${conversationId}`).pipe(
            tap(() => {
                const current = this.conversationsSubject.value;
                this.conversationsSubject.next(current.filter(c => c.id !== conversationId));
            })
        );
    }

    /**
     * Update conversation in local state
     */
    updateConversationLocally(conversation: Conversation): void {
        const current = this.conversationsSubject.value;
        const index = current.findIndex(c => c.id === conversation.id);
        if (index > -1) {
            current[index] = conversation;
            this.conversationsSubject.next([...current]);
        }
    }

    /**
     * Generate a unique message ID
     */
    generateMessageId(): string {
        return crypto.randomUUID();
    }
}