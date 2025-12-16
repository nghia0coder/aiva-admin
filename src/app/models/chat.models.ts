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
    updatedAt: string;
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