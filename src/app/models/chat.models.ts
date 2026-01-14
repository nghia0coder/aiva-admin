// Request DTOs
export interface StreamChatRequest {
    conversationId: string; // Guid as string
    message: string;
}

export interface CreateConversationRequest {
    title?: string;
    systemPrompt?: string;
}

// Response DTOs
export interface StreamChatResponse {
    content: string;       // Streamed text chunk
    isComplete: boolean;   // Final chunk indicator
    messageId?: string;    // Optional message ID from backend
}

export interface ConversationDto {
    id: string;
    title: string;
    createdAt: string;
    lastMessageAt?: string;
    messageCount?: number;
}

export interface CreateConversationResponseDto {
    conversationId: string;
    title: string;
}

export interface PaginatedConversationsResponse {
    items: ConversationDto[];
    page: number;
    perPage: number;
    totalCount: number;
    totalPages: number;
}

export interface MessageDto {
    id: string;
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
}

// Frontend models
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    isStreaming?: boolean;
    error?: string;
}

export interface Conversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: Date;
    updatedAt: Date;
}

export interface SuggestedPrompt {
    icon: string;
    title: string;
    description: string;
    prompt: string;
}

// SignalR models
export interface TitleUpdatedMessage {
    conversationId: string;
    newTitle: string;
    updatedAt: string; // ISO 8601 date string from backend
}

export enum SignalRConnectionState {
    Disconnected = 'Disconnected',
    Connecting = 'Connecting',
    Connected = 'Connected',
    Reconnecting = 'Reconnecting'
}
