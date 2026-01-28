import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/http/api.service';

/**
 * Request parameters for listing folders
 */
export interface ListFoldersRequest {
    storageId?: number;
    parentFolderId?: number;
    page?: number;
    pageSize?: number;
    searchTerm?: string;
    includeChildren?: boolean;
}

/**
 * Individual folder item from the API
 */
export interface Folder {
    id: number;
    folderName: string;
    description: string | null;
    blobPrefix: string;
    storageId: number;
    parentFolderId: number | null;
    createdOnUtc: string;
}

/**
 * Paginated response for folders
 */
export interface ListFoldersResponse {
    folders: Folder[];
    totalCount: number;
    page: number;
    pageSize: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}

/**
 * Request parameters for creating a folder
 */
export interface CreateFolderRequest {
    folderName: string;
    storageId: number;
    parentFolderId?: number | null;
}

/**
 * Response from creating a folder
 */
export interface CreateFolderResponse {
    id: number;
    folderName: string;
    description: string | null;
    blobPrefix: string;
    storageId: number;
    parentFolderId: number | null;
    createdOnUtc: string;
}

/**
 * Breadcrumb item for navigation
 */
export interface Breadcrumb {
    id: number | null;
    name: string;
    path: string;
}

/**
 * Folder item in contents response
 */
export interface FolderContent {
    id: number;
    name: string;
    description: string | null;
    blobPrefix: string;
    subfolderCount: number;
    fileCount: number;
    totalSizeBytes: number;
    createdOnUtc: string;
    updatedOnUtc: string | null;
}

/**
 * File item in contents response
 */
export interface FileContent {
    id: number;
    originalFileName: string;
    extension: string;
    contentType: string;
    fileSizeBytes: number;
    blobUrl: string;
    processingStatus: string;
    createdOnUtc: string;
}

/**
 * Statistics for folder contents
 */
export interface FolderStats {
    totalFolders: number;
    totalFiles: number;
    totalSizeBytes: number;
}

/**
 * Pagination info for folder contents
 */
export interface ContentsPagination {
    page: number;
    pageSize: number;
    totalCount: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}

/**
 * Request parameters for getting folder contents
 */
export interface GetFolderContentsRequest {
    folderId?: number | null;
    storageId?: number | null;
    searchQuery?: string;
    sortBy?: 'name' | 'date' | 'size';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
}

/**
 * Response from getting folder contents
 */
export interface GetFolderContentsResponse {
    breadcrumbs: Breadcrumb[];
    folders: FolderContent[];
    files: FileContent[];
    stats: FolderStats;
    pagination: ContentsPagination;
}

/**
 * Service for managing folder operations
 */
@Injectable({ providedIn: 'root' })
export class FolderService {
    private readonly apiService = inject(ApiService);

    /**
     * Retrieve a paginated list of folders
     * @param params - Request parameters for filtering and pagination
     * @returns Observable of the paginated folder response
     */
    getFolders(params: ListFoldersRequest = {}): Observable<ListFoldersResponse> {
        // Build query parameters
        const queryParams = new URLSearchParams();

        // Default storageId to 1 if not provided
        const storageId = params.storageId ?? 1;
        queryParams.append('StorageId', storageId.toString());

        if (params.parentFolderId !== undefined && params.parentFolderId !== null) {
            queryParams.append('ParentFolderId', params.parentFolderId.toString());
        }

        queryParams.append('Page', (params.page ?? 1).toString());
        queryParams.append('PageSize', (params.pageSize ?? 50).toString());

        if (params.searchTerm) {
            queryParams.append('SearchTerm', params.searchTerm);
        }

        if (params.includeChildren !== undefined) {
            queryParams.append('IncludeChildren', params.includeChildren.toString());
        }

        const endpoint = `/folders?${queryParams.toString()}`;
        return this.apiService.get<ListFoldersResponse>(endpoint);
    }

    /**
     * Create a new folder
     * @param request - Folder creation parameters
     * @returns Observable of the created folder
     */
    createFolder(request: CreateFolderRequest): Observable<CreateFolderResponse> {
        const endpoint = '/folders';
        return this.apiService.post<CreateFolderRequest, CreateFolderResponse>(endpoint, request);
    }

    /**
     * Get folder contents (subfolders and files)
     * @param request - Request parameters for folder contents
     * @returns Observable of folder contents response
     */
    getFolderContents(request: GetFolderContentsRequest = {}): Observable<GetFolderContentsResponse> {
        const queryParams = new URLSearchParams();

        if (request.folderId !== undefined && request.folderId !== null) {
            queryParams.append('FolderId', request.folderId.toString());
        }

        if (request.storageId !== undefined && request.storageId !== null) {
            queryParams.append('StorageId', request.storageId.toString());
        } else if (!request.folderId) {
            // Default storageId to 1 for root level
            queryParams.append('StorageId', '1');
        }

        if (request.searchQuery) {
            queryParams.append('SearchQuery', request.searchQuery);
        }

        if (request.sortBy) {
            queryParams.append('SortBy', request.sortBy);
        }

        if (request.sortOrder) {
            queryParams.append('SortOrder', request.sortOrder);
        }

        queryParams.append('Page', (request.page ?? 1).toString());
        queryParams.append('PageSize', (request.pageSize ?? 50).toString());

        const endpoint = `/folders/contents?${queryParams.toString()}`;
        return this.apiService.get<GetFolderContentsResponse>(endpoint);
    }

    /**
     * Upload a file to a folder
     * @param storageId - Storage ID
     * @param folderId - Folder ID to upload to
     * @param file - File to upload
     * @returns Observable of the upload response
     */
    uploadFile(storageId: number, folderId: number, file: File): Observable<UploadFileResponse> {
        const formData = new FormData();
        formData.append('StorageId', storageId.toString());
        formData.append('FolderId', folderId.toString());
        formData.append('File', file, file.name);

        const endpoint = '/files/upload';
        return this.apiService.post<FormData, UploadFileResponse>(endpoint, formData);
    }

    /**
     * Delete a file
     * @param fileId - ID of the file to delete
     * @returns Observable of void (204 No Content)
     */
    deleteFile(fileId: number): Observable<void> {
        const endpoint = `/files/${fileId}`;
        return this.apiService.delete<void>(endpoint);
    }
}

/**
 * Response from uploading a file
 */
export interface UploadFileResponse {
    id: number;
    originalFileName: string;
    storedFileName: string;
    extension: string;
    contentType: string;
    fileSizeBytes: number;
    blobPath: string;
    blobUrl: string;
    storageId: number;
    folderId: number;
    fileProcessingStatus: string;
    queuedAt: string | null;
    createdOnUtc: string;
}
