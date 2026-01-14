import { Injectable, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, BehaviorSubject, catchError, of, tap } from 'rxjs';
import {
    StreamChatRequest,
    StreamChatResponse,
    Conversation,
    ConversationDto,
    CreateConversationResponseDto,
    PaginatedConversationsResponse,
    MessageDto,
    CreateConversationRequest,
    TitleUpdatedMessage,
} from '../models/chat.models';
import { ApiService } from '../core/http/api.service';
import { SignalRService } from './signalr.service';

@Injectable({ providedIn: 'root' })
export class ChatService {
    private readonly api = inject(ApiService);
    private readonly signalrService = inject(SignalRService);
    private readonly destroyRef = inject(DestroyRef);

    // API endpoints
    private readonly endpoints = {
        streamChat: (conversationId: string) => `/conversations/${conversationId}/stream`,
        conversations: '/conversations',
        messages: (conversationId: string) => `/conversations/${conversationId}/messages`
    };

    // State management
    private conversationsSubject = new BehaviorSubject<Conversation[]>([]);
    conversations$ = this.conversationsSubject.asObservable();

    // Pagination state
    private paginationSubject = new BehaviorSubject<{
        currentPage: number;
        perPage: number;
        totalCount: number;
        totalPages: number;
        hasMore: boolean;
    }>({
        currentPage: 1,
        perPage: 10,
        totalCount: 0,
        totalPages: 0,
        hasMore: false
    });
    pagination$ = this.paginationSubject.asObservable();

    constructor() {
        // Subscribe to real-time title updates from SignalR
        this.subscribeToTitleUpdates();
    }

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
    createConversation(title?: string, systemPrompt?: string): Observable<CreateConversationResponseDto> {
        const request: CreateConversationRequest = { title, systemPrompt };

        return this.api.post<CreateConversationRequest, CreateConversationResponseDto>(
            this.endpoints.conversations,
            request
        ).pipe(
            tap(conversation => {
                const current = this.conversationsSubject.value;
                const now = new Date();
                const newConversation: Conversation = {
                    id: conversation.conversationId,
                    title: conversation.title,
                    messages: [],
                    createdAt: now,
                    updatedAt: now
                };
                this.conversationsSubject.next([newConversation, ...current]);
            })
        );
    }

    /**
     * Get conversations with pagination
     * @param page Page number (default: 1)
     * @param perPage Items per page (default: 10)
     * @param append If true, append to existing conversations instead of replacing
     */
    getConversations(page: number = 1, perPage: number = 10, append: boolean = false): Observable<PaginatedConversationsResponse> {
        const params = new URLSearchParams({
            page: page.toString(),
            perPage: perPage.toString()
        });
        const url = `${this.endpoints.conversations}?${params.toString()}`;

        return this.api.get<PaginatedConversationsResponse>(url).pipe(
            tap(response => {
                const mapped: Conversation[] = response.items.map(c => ({
                    id: c.id,
                    title: c.title,
                    messages: [],
                    createdAt: new Date(c.createdAt),
                    updatedAt: new Date(c.lastMessageAt || c.createdAt)
                }));

                if (append) {
                    const current = this.conversationsSubject.value;
                    // Avoid duplicates
                    const existingIds = new Set(current.map(c => c.id));
                    const newConversations = mapped.filter(c => !existingIds.has(c.id));
                    this.conversationsSubject.next([...current, ...newConversations]);
                } else {
                    this.conversationsSubject.next(mapped);
                }

                // Update pagination state
                this.paginationSubject.next({
                    currentPage: response.page,
                    perPage: response.perPage,
                    totalCount: response.totalCount,
                    totalPages: response.totalPages,
                    hasMore: response.page < response.totalPages
                });
            }),
            catchError(error => {
                console.error('Failed to load conversations:', error);
                return of({
                    items: [],
                    page: 1,
                    perPage: 10,
                    totalCount: 0,
                    totalPages: 0
                });
            })
        );
    }

    /**
     * Load more conversations (next page)
     */
    loadMoreConversations(): Observable<PaginatedConversationsResponse> {
        const currentPagination = this.paginationSubject.value;
        if (!currentPagination.hasMore) {
            return of({
                items: [],
                page: currentPagination.currentPage,
                perPage: currentPagination.perPage,
                totalCount: currentPagination.totalCount,
                totalPages: currentPagination.totalPages
            });
        }
        return this.getConversations(currentPagination.currentPage + 1, currentPagination.perPage, true);
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

    /**
     * Subscribe to real-time title updates from SignalR
     */
    private subscribeToTitleUpdates(): void {
        this.signalrService.titleUpdated$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (message: TitleUpdatedMessage) => {
                    console.log('Received title update:', message);
                    this.updateConversationTitle(message.conversationId, message.newTitle);
                },
                error: (error) => {
                    console.error('Error receiving title update:', error);
                }
            });
    }

    /**
     * Update conversation title in local state
     */
    updateConversationTitle(conversationId: string, newTitle: string): void {
        const current = this.conversationsSubject.value;
        const index = current.findIndex(c => c.id === conversationId);

        if (index > -1) {
            // Update the conversation with new title
            current[index] = {
                ...current[index],
                title: newTitle,
                updatedAt: new Date()
            };
            this.conversationsSubject.next([...current]);
            console.log(`Updated conversation ${conversationId} title to: ${newTitle}`);
        } else {
            console.warn(`Conversation ${conversationId} not found in local state`);
        }
    }
}