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
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt: string;
    responseType?: {
        name: string;
        value: number;
    };
    structuredData?: import('./structured-response.models').StructuredDataEvent;
    chartData?: ChartConfiguration;
}

// Cursor-based pagination models
export interface PaginationInfo {
    hasMore: boolean;          // More older messages exist
    hasNewer: boolean;         // More newer messages exist
    oldestMessageId?: string;  // Cursor for loading older messages
    newestMessageId?: string;  // Cursor for loading newer messages
    oldestTimestamp?: string;  // Timestamp of oldest message
    newestTimestamp?: string;  // Timestamp of newest message
    totalMessages: number;     // Total message count in conversation
    returnedCount: number;     // Number of messages in current response
}

export interface ConversationMetadata {
    totalMessages: number;
    totalTokens?: number;
    lastActiveAt?: string;
}

export interface ConversationHistoryResponse {
    id: string;
    title: string;
    systemPrompt?: string;
    createdAt: string;
    messages: MessageDto[];
    metadata?: ConversationMetadata;
    pagination?: PaginationInfo;
}

// Frontend models
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    isStreaming?: boolean;
    error?: string;
    responseType?: 'text' | 'structured_table' | 'chart' | 'markdown_table';
    structuredData?: import('./structured-response.models').StructuredDataEvent;
    chartData?: ChartConfiguration;
    markdownTable?: string; // For storing markdown table content separately
}

// Chart.js configuration interface
export interface ChartConfiguration {
    type: 'bar' | 'line' | 'pie' | 'doughnut' | 'radar' | 'polarArea' | 'bubble' | 'scatter';
    data: {
        labels?: string[];
        datasets: ChartDataset[];
    };
    options?: any;
}

export interface ChartDataset {
    label?: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
    tension?: number;
    fill?: boolean;
}

export interface Conversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: Date;
    updatedAt: Date;
    // Pagination state for messages
    messagePagination?: PaginationInfo;
    isLoadingOlderMessages?: boolean;
    isLoadingNewerMessages?: boolean;
    messagesFullyLoaded?: boolean; // True when all messages are loaded
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
