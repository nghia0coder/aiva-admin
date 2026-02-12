/**
 * Structured Response Models
 * 
 * These models define the structure for table-based responses from the backend
 * that are streamed via Server-Sent Events (SSE).
 */

export interface StructuredDataEvent {
    metadata: TableMetadata;
    columns: TableColumn[];
    rows: TableRow[];
    globalActions: ActionMetadata[];
}

export interface TableMetadata {
    title: string;
    description?: string;
    totalCount: number;
    displayedCount: number;
}

export interface TableColumn {
    key: string;
    label: string;
    type: ColumnType;
    sortable: boolean;
    filterable: boolean;
}

export type ColumnType =
    | 'Text'
    | 'Number'
    | 'Currency'
    | 'Image'
    | 'Rating'
    | 'Date'
    | 'Boolean';

export interface TableRow {
    id: string;
    cells: Record<string, any>;
    actions: ActionMetadata[];
}

export interface ActionMetadata {
    type: ActionType;
    label: string;
    icon?: string;
    endpoint: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    params: Record<string, any>;
    isDisabled: boolean;
    disabledReason?: string;
}

export type ActionType =
    | 'ViewDetail'
    | 'AddToCart'
    | 'Compare'
    | 'Share'
    | 'QuickView'
    | 'AddToWishlist'
    | 'NotifyWhenAvailable';

/**
 * SSE Event Types
 */
export type SSEEventType =
    | 'message'                      // Text content chunk
    | 'structured_data_start'        // Table initialization (metadata + columns)
    | 'structured_data_row'          // Single table row (progressive)
    | 'structured_data_complete'     // Global actions after all rows
    | 'chart'                        // Chart data (Chart.js configuration)
    | 'table'                        // Markdown table content
    | 'done'                         // Stream completion
    | 'error';                       // Error event

export interface SSEEvent {
    type: SSEEventType;
    data: any;
}

/**
 * Specific SSE Event Data Types
 */
export interface MessageEventData {
    content: string;
}

/**
 * Structured data start event - initializes table with metadata and columns
 */
export interface StructuredDataStartEvent {
    metadata: TableMetadata;
    columns: TableColumn[];
}

/**
 * Structured data row event - single row streamed progressively
 * Uses the same structure as TableRow
 */
export type StructuredDataRowEvent = TableRow;

/**
 * Structured data complete event - sent after all rows with global actions
 */
export interface StructuredDataCompleteEvent {
    globalActions: ActionMetadata[];
}

export interface DoneEventData {
    complete: boolean;
    hasStructuredData?: boolean;
}

export interface ErrorEventData {
    message: string;
    code?: string;
}
