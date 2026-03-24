import { DestroyRef, Injectable, inject } from '@angular/core';
import { Observable, BehaviorSubject, catchError, of, tap } from 'rxjs';
import {
    StreamChatRequest,
    StreamChatResponse,
    Conversation,
    CreateConversationResponseDto,
    PaginatedConversationsResponse,
    MessageDto,
    CreateConversationRequest,
    TitleUpdatedMessage,
    ConversationHistoryResponse,
    PaginationInfo,
} from '../models/chat.models';
import { ApiService } from '../core/http/api.service';
import { SignalRService } from './signalr.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Injectable({ providedIn: 'root' })
export class ChatService {
    private readonly api = inject(ApiService);
    private readonly signalrService = inject(SignalRService);
    private readonly destroyRef = inject(DestroyRef);

    // API endpoints
    private readonly endpoints = {
        streamChat: (conversationId: string) => `/conversations/${conversationId}/stream`,
        conversations: '/conversations',
        messages: (conversationId: string) => `/conversations/${conversationId}/messages`,
        updateTitle: (conversationId: string) => `/conversations/${conversationId}/title`
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

    // Track if conversations have been loaded
    private conversationsLoaded = false;

    constructor() {
        // Subscribe to real-time title updates from SignalR
        this.subscribeToTitleUpdates();
    }

    /**
     * Stream chat response from AI
     * Returns SSE events which can be 'message', 'structured_data', 'done', or 'error'
     */
    streamChat(conversationId: string, message: string, additionalUserData?: string, images?: File[]): Observable<import('../models/structured-response.models').SSEEvent> {
        // We ALWAYS use FormData because FastEndpoints AllowFormData() strictly mandates
        // a 'multipart/form-data' or 'application/x-www-form-urlencoded' Content-Type.
        // Sending 'application/json' will trigger a 415 Unsupported Media Type error.
        
        const formData = new FormData();
        formData.append('conversationId', conversationId);
        formData.append('message', message);
        if (additionalUserData) {
            formData.append('additionalUserData', additionalUserData);
        }
        
        if (images && images.length > 0) {
            formData.append('hasImages', 'true');
            images.forEach((file) => {
                formData.append('images', file, file.name);
            });
        } else {
            formData.append('hasImages', 'false');
        }

        return this.api.stream<import('../models/structured-response.models').SSEEvent>(this.endpoints.streamChat(conversationId), formData);
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
     * @param forceRefresh If true, fetch even if conversations are already loaded
     */
    getConversations(page: number = 1, perPage: number = 10, append: boolean = false, forceRefresh: boolean = false): Observable<PaginatedConversationsResponse> {
        // If conversations are already loaded and we're not forcing a refresh or appending, return cached data
        if (this.conversationsLoaded && !forceRefresh && !append && page === 1) {
            return of({
                items: [],
                page: this.paginationSubject.value.currentPage,
                perPage: this.paginationSubject.value.perPage,
                totalCount: this.paginationSubject.value.totalCount,
                totalPages: this.paginationSubject.value.totalPages
            });
        }

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

                // Mark conversations as loaded
                this.conversationsLoaded = true;
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
     * Get messages for a conversation with cursor-based pagination
     * @param conversationId Conversation ID
     * @param options Pagination options
     */
    getMessages(
        conversationId: string,
        options?: {
            limit?: number;
            beforeMessageId?: string;
            afterMessageId?: string;
            aroundMessageId?: string;
        }
    ): Observable<ConversationHistoryResponse> {
        let url = `${this.endpoints.conversations}/${conversationId}`;

        if (options) {
            const params = new URLSearchParams();

            if (options.limit) {
                params.append('limit', options.limit.toString());
            }
            if (options.beforeMessageId) {
                params.append('beforeMessageId', options.beforeMessageId);
            }
            if (options.afterMessageId) {
                params.append('afterMessageId', options.afterMessageId);
            }
            if (options.aroundMessageId) {
                params.append('aroundMessageId', options.aroundMessageId);
            }

            const queryString = params.toString();
            if (queryString) {
                url += `?${queryString}`;
            }
        }

        return this.api.get<ConversationHistoryResponse>(url);
    }

    /**
     * Load latest messages for a conversation (initial load)
     */
    loadLatestMessages(conversationId: string, limit: number = 50): Observable<ConversationHistoryResponse> {
        return this.getMessages(conversationId, { limit });
    }

    /**
     * Load older messages (scroll up)
     */
    loadOlderMessages(conversationId: string, beforeMessageId: string, limit: number = 50): Observable<ConversationHistoryResponse> {
        return this.getMessages(conversationId, { beforeMessageId, limit });
    }

    /**
     * Load newer messages (scroll down)
     */
    loadNewerMessages(conversationId: string, afterMessageId: string, limit: number = 50): Observable<ConversationHistoryResponse> {
        return this.getMessages(conversationId, { afterMessageId, limit });
    }

    /**
     * Load messages around a specific message (deep linking)
     */
    loadMessagesAround(conversationId: string, aroundMessageId: string, limit: number = 100): Observable<ConversationHistoryResponse> {
        return this.getMessages(conversationId, { aroundMessageId, limit });
    }

    /**
     * Delete a conversation
     */
    deleteConversation(conversationId: string): Observable<void> {
        return this.api.delete<void>(`${this.endpoints.conversations}/${conversationId}`).pipe(
            tap(() => {
                const current = this.conversationsSubject.value;
                this.conversationsSubject.next(current.filter(c => c.id !== conversationId));
                // Update pagination count
                const pagination = this.paginationSubject.value;
                this.paginationSubject.next({
                    ...pagination,
                    totalCount: Math.max(0, pagination.totalCount - 1)
                });
            })
        );
    }

    /**
     * Manually update conversation title
     */
    updateConversationTitleManually(conversationId: string, title: string): Observable<void> {
        const request = { Title: title };
        return this.api.put<{ Title: string }, void>(
            this.endpoints.updateTitle(conversationId),
            request
        ).pipe(
            tap(() => {
                // Update local state immediately
                this.updateConversationTitle(conversationId, title);
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
            const existing = current[index];
            // If the incoming title is "New Conversation" but the existing one is not,
            // it means we probably have a stale object from a SignalR update.
            // We should preserve the existing title.
            if (conversation.title === 'New Conversation' && existing.title !== 'New Conversation') {
                console.log(`Preserving existing title "${existing.title}" over "New Conversation" for ${conversation.id}`);
                conversation.title = existing.title;
            }
            
            current[index] = conversation;
            this.conversationsSubject.next([...current]);
        }
    }

    /**
     * Refresh conversations from the server
     * Use this when you need to ensure you have the latest data
     */
    refreshConversations(): Observable<PaginatedConversationsResponse> {
        return this.getConversations(1, this.paginationSubject.value.perPage, false, true);
    }

    /**
     * Check if conversations are already loaded
     */
    isConversationsLoaded(): boolean {
        return this.conversationsLoaded;
    }

    /**
     * Reset the loaded state (useful for logout or manual refresh)
     */
    resetConversationsCache(): void {
        this.conversationsLoaded = false;
        this.conversationsSubject.next([]);
        this.paginationSubject.next({
            currentPage: 1,
            perPage: 10,
            totalCount: 0,
            totalPages: 0,
            hasMore: false
        });
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

    /**
     * Generate a unique message ID
     */
    generateMessageId(): string {
        return crypto.randomUUID();
    }
}