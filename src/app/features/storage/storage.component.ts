import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  FolderService,
  CreateFolderRequest,
  GetFolderContentsResponse,
  Breadcrumb,
  FolderContent,
  FileContent
} from '../../services/folder.service';

interface FileItem {
  id: number;
  name: string;
  type: 'folder' | 'file';
  size?: string;
  modified: string;
  icon?: string;
  description?: string | null;
  subfolderCount?: number;
  fileCount?: number;
  blobUrl?: string;
  extension?: string;
}

@Component({
  selector: 'app-storage',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './storage.component.html',
  styleUrls: ['./storage.component.scss']
})
export class StorageComponent implements OnInit {
  private readonly folderService = inject(FolderService);

  // Data properties
  files: FileItem[] = [];
  breadcrumbs: Breadcrumb[] = [];

  // Pagination properties
  currentPage = 1;
  pageSize = 50;
  totalCount = 0;
  hasNextPage = false;
  hasPreviousPage = false;

  // Navigation properties
  currentFolderId: number | null = null;
  storageId = 1; // Default storage ID

  // Filter and sort properties
  searchTerm = '';
  sortBy: 'name' | 'date' | 'size' = 'name';
  sortOrder: 'asc' | 'desc' = 'asc';

  // UI state properties
  isLoading = false;
  errorMessage: string | null = null;

  // Create folder modal properties
  showCreateModal = false;
  newFolderName = '';
  isCreating = false;
  createError: string | null = null;

  // Upload file modal properties
  showUploadModal = false;
  selectedFolder: FileItem | null = null;
  selectedFile: File | null = null;
  isUploading = false;
  uploadError: string | null = null;
  uploadProgress = 0;

  // Folder menu state
  openMenuFolderId: number | null = null;

  // File menu state
  openMenuFileId: number | null = null;

  // Delete file state
  isDeletingFile = false;
  showDeleteModal = false;
  fileToDelete: FileItem | null = null;

  // Stats
  totalFolders = 0;
  totalFiles = 0;
  totalSizeBytes = 0;

  // Storage usage (mock data for now - can be fetched from API later)
  storageUsed = 45.8;
  storageTotal = 100;

  ngOnInit(): void {
    this.loadFolderContents();
  }

  /**
   * Load folder contents from the API
   * Uses getFolders for root level, getFolderContents for specific folders
   */
  loadFolderContents(): void {
    // If we're at root level (no currentFolderId), use the simpler getFolders API
    if (this.currentFolderId === null) {
      this.loadRootFolders();
    } else {
      // Otherwise, use getFolderContents for specific folder navigation
      this.loadSpecificFolderContents();
    }
  }

  /**
   * Load root level folders using getFolders API
   */
  private loadRootFolders(): void {
    this.isLoading = true;
    this.errorMessage = null;

    this.folderService.getFolders({
      storageId: this.storageId,
      page: this.currentPage,
      pageSize: this.pageSize,
      searchTerm: this.searchTerm || undefined
    }).subscribe({
      next: (response) => {
        // Map only folders (no files at root level with this API)
        this.files = this.mapSimpleFoldersToFileItems(response.folders);

        // Clear breadcrumbs at root level
        this.breadcrumbs = [];

        // Update pagination
        this.totalCount = response.totalCount;
        this.currentPage = response.page;
        this.pageSize = response.pageSize;
        this.hasNextPage = response.hasNextPage;
        this.hasPreviousPage = response.hasPreviousPage;

        // Clear stats (not available in getFolders response)
        this.totalFolders = response.totalCount;
        this.totalFiles = 0;
        this.totalSizeBytes = 0;

        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading folders:', error);
        this.errorMessage = error.message || 'Failed to load folders. Please try again.';
        this.isLoading = false;
        this.files = [];
      }
    });
  }

  /**
   * Load specific folder contents using getFolderContents API
   */
  private loadSpecificFolderContents(): void {
    this.isLoading = true;
    this.errorMessage = null;

    this.folderService.getFolderContents({
      folderId: this.currentFolderId,
      searchQuery: this.searchTerm || undefined,
      sortBy: this.sortBy,
      sortOrder: this.sortOrder,
      page: this.currentPage,
      pageSize: this.pageSize
    }).subscribe({
      next: (response: GetFolderContentsResponse) => {
        // Map folders and files to FileItem array
        const folderItems = this.mapFoldersToFileItems(response.folders);
        const fileItems = this.mapFilesToFileItems(response.files);
        this.files = [...folderItems, ...fileItems];

        // Update breadcrumbs
        this.breadcrumbs = response.breadcrumbs;

        // Update pagination
        this.totalCount = response.pagination.totalCount;
        this.currentPage = response.pagination.page;
        this.pageSize = response.pagination.pageSize;
        this.hasNextPage = response.pagination.hasNextPage;
        this.hasPreviousPage = response.pagination.hasPreviousPage;

        // Update stats
        this.totalFolders = response.stats.totalFolders;
        this.totalFiles = response.stats.totalFiles;
        this.totalSizeBytes = response.stats.totalSizeBytes;

        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading folder contents:', error);
        this.errorMessage = error.message || 'Failed to load folder contents. Please try again.';
        this.isLoading = false;
        this.files = [];
      }
    });
  }

  /**
   * Map simple API folder objects (from getFolders) to FileItem interface
   */
  private mapSimpleFoldersToFileItems(folders: any[]): FileItem[] {
    return folders.map(folder => ({
      id: folder.id,
      name: folder.folderName,
      type: 'folder' as const,
      modified: this.formatDate(folder.createdOnUtc),
      description: folder.description
    }));
  }

  /**
   * Map API folder objects (from getFolderContents) to FileItem interface
   */
  private mapFoldersToFileItems(folders: FolderContent[]): FileItem[] {
    return folders.map(folder => ({
      id: folder.id,
      name: folder.name,
      type: 'folder' as const,
      modified: this.formatDate(folder.createdOnUtc),
      description: folder.description,
      subfolderCount: folder.subfolderCount,
      fileCount: folder.fileCount
    }));
  }

  /**
   * Map API file objects to FileItem interface
   */
  private mapFilesToFileItems(files: FileContent[]): FileItem[] {
    return files.map(file => ({
      id: file.id,
      name: file.originalFileName,
      type: 'file' as const,
      size: this.formatFileSize(file.fileSizeBytes),
      modified: this.formatDate(file.createdOnUtc),
      icon: this.getFileIconFromExtension(file.extension),
      blobUrl: file.blobUrl,
      extension: file.extension
    }));
  }

  /**
   * Format file size in bytes to human-readable format
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get file icon type from extension
   */
  private getFileIconFromExtension(extension: string): string {
    const ext = extension.toLowerCase();

    if (ext === '.pdf') return 'pdf';
    if (ext === '.doc' || ext === '.docx') return 'docx';
    if (ext === '.xls' || ext === '.xlsx') return 'xlsx';
    if (ext === '.ppt' || ext === '.pptx') return 'pptx';
    if (ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.gif' || ext === '.svg') return 'image';
    if (ext === '.zip' || ext === '.rar' || ext === '.7z') return 'archive';
    if (ext === '.mp4' || ext === '.avi' || ext === '.mov') return 'video';
    if (ext === '.mp3' || ext === '.wav') return 'audio';
    if (ext === '.txt' || ext === '.md') return 'text';

    return 'file';
  }

  /**
   * Format ISO date string to readable format
   */
  private formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today, ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} `;
    } else if (diffDays === 1) {
      return `Yesterday, ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} `;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }

  /**
   * Navigate to next page
   */
  nextPage(): void {
    if (this.hasNextPage) {
      this.currentPage++;
      this.loadFolderContents();
    }
  }

  /**
   * Navigate to previous page
   */
  previousPage(): void {
    if (this.hasPreviousPage) {
      this.currentPage--;
      this.loadFolderContents();
    }
  }

  /**
   * Go to specific page
   */
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadFolderContents();
    }
  }

  /**
   * Handle search input
   */
  onSearch(): void {
    this.currentPage = 1; // Reset to first page on new search
    this.loadFolderContents();
  }

  /**
   * Clear search and reload
   */
  clearSearch(): void {
    this.searchTerm = '';
    this.currentPage = 1;
    this.loadFolderContents();
  }

  /**
   * Retry loading after error
   */
  retry(): void {
    this.loadFolderContents();
  }

  /**
   * Get total number of pages
   */
  get totalPages(): number {
    return Math.ceil(this.totalCount / this.pageSize);
  }

  /**
   * Get storage percentage for progress bar
   */
  get storagePercentage(): number {
    return (this.storageUsed / this.storageTotal) * 100;
  }

  /**
   * Get file icon type
   */
  getFileIcon(file: FileItem): string {
    if (file.type === 'folder') return 'folder';
    return file.icon || 'file';
  }

  /**
   * Get page numbers for pagination display
   */
  get pageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    const totalPages = this.totalPages;

    if (totalPages <= maxPagesToShow) {
      // Show all pages if total is less than max
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show current page with 2 pages before and after
      let startPage = Math.max(1, this.currentPage - 2);
      let endPage = Math.min(totalPages, this.currentPage + 2);

      // Adjust if we're near the start or end
      if (this.currentPage <= 3) {
        endPage = maxPagesToShow;
      } else if (this.currentPage >= totalPages - 2) {
        startPage = totalPages - maxPagesToShow + 1;
      }

      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
    }

    return pages;
  }

  /**
   * Open create folder modal
   */
  openCreateModal(): void {
    this.showCreateModal = true;
    this.newFolderName = '';
    this.createError = null;
  }

  /**
   * Close create folder modal
   */
  closeCreateModal(): void {
    this.showCreateModal = false;
    this.newFolderName = '';
    this.createError = null;
    this.isCreating = false;
  }

  /**
   * Create a new folder
   */
  createFolder(): void {
    // Validate folder name
    if (!this.newFolderName.trim()) {
      this.createError = 'Folder name is required';
      return;
    }

    if (this.newFolderName.length > 255) {
      this.createError = 'Folder name is too long (max 255 characters)';
      return;
    }

    this.isCreating = true;
    this.createError = null;

    const request: CreateFolderRequest = {
      folderName: this.newFolderName.trim(),
      storageId: this.storageId,
      parentFolderId: this.currentFolderId
    };

    this.folderService.createFolder(request).subscribe({
      next: () => {
        // Close modal
        this.closeCreateModal();

        // Reload folders to show the new one
        this.loadFolderContents();
      },
      error: (error) => {
        console.error('Error creating folder:', error);
        this.createError = error.message || 'Failed to create folder. Please try again.';
        this.isCreating = false;
      }
    });
  }

  /**
   * Check if folder name is valid
   */
  get isFolderNameValid(): boolean {
    return this.newFolderName.trim().length > 0 && this.newFolderName.length <= 255;
  }

  /**
   * Navigate into a folder
   */
  openFolder(folderId: number): void {
    this.currentFolderId = folderId;
    this.currentPage = 1; // Reset to first page
    this.searchTerm = ''; // Clear search
    this.loadFolderContents();
  }

  /**
   * Navigate via breadcrumb
   */
  navigateToBreadcrumb(breadcrumb: Breadcrumb): void {
    this.currentFolderId = breadcrumb.id;
    this.currentPage = 1;
    this.searchTerm = '';
    this.loadFolderContents();
  }

  /**
   * Handle file/folder click
   */
  onItemClick(item: FileItem): void {
    if (item.type === 'folder') {
      this.openFolder(item.id);
    } else {
      // For files, you could open in a new tab or download
      if (item.blobUrl) {
        window.open(item.blobUrl, '_blank');
      }
    }
  }

  /**
   * Get formatted total size
   */
  get formattedTotalSize(): string {
    return this.formatFileSize(this.totalSizeBytes);
  }

  /**
   * Toggle folder menu
   */
  toggleFolderMenu(event: Event, folderId: number): void {
    event.stopPropagation(); // Prevent folder navigation
    this.openMenuFolderId = this.openMenuFolderId === folderId ? null : folderId;
  }

  /**
   * Close folder menu
   */
  closeFolderMenu(): void {
    this.openMenuFolderId = null;
    this.openMenuFileId = null;
  }

  /**
   * Toggle file menu
   */
  toggleFileMenu(event: Event, fileId: number): void {
    event.stopPropagation(); // Prevent file opening
    this.openMenuFileId = this.openMenuFileId === fileId ? null : fileId;
    this.openMenuFolderId = null; // Close folder menu if open
  }

  /**
   * Open delete confirmation modal
   */
  openDeleteModal(event: Event, file: FileItem): void {
    event.stopPropagation();
    this.fileToDelete = file;
    this.showDeleteModal = true;
    this.closeFolderMenu(); // Close menu
  }

  /**
   * Close delete confirmation modal
   */
  closeDeleteModal(): void {
    this.showDeleteModal = false;
    this.fileToDelete = null;
    this.isDeletingFile = false;
  }

  /**
   * Confirm and delete the file
   */
  confirmDeleteFile(): void {
    if (!this.fileToDelete) return;

    this.isDeletingFile = true;

    this.folderService.deleteFile(this.fileToDelete.id).subscribe({
      next: () => {
        console.log('File deleted successfully');

        // Close modal and reload
        this.closeDeleteModal();
        this.loadFolderContents();
      },
      error: (error) => {
        console.error('Error deleting file:', error);
        // Show error in modal (you could add an error property to display in the modal)
        alert(error.message || 'Failed to delete file. Please try again.');
        this.isDeletingFile = false;
      }
    });
  }

  /**
   * Open upload modal for a folder
   */
  openUploadModal(event: Event, folder: FileItem): void {
    event.stopPropagation(); // Prevent folder navigation
    this.selectedFolder = folder;
    this.showUploadModal = true;
    this.selectedFile = null;
    this.uploadError = null;
    this.uploadProgress = 0;
    this.closeFolderMenu();
  }

  /**
   * Close upload modal
   */
  closeUploadModal(): void {
    this.showUploadModal = false;
    this.selectedFolder = null;
    this.selectedFile = null;
    this.uploadError = null;
    this.uploadProgress = 0;
    this.isUploading = false;
  }

  /**
   * Open upload modal for the current folder (when viewing subfolder)
   */
  openUploadModalForCurrentFolder(): void {
    if (this.currentFolderId === null) return;

    // Get current folder name from breadcrumbs (last item)
    const currentFolderName = this.breadcrumbs.length > 0
      ? this.breadcrumbs[this.breadcrumbs.length - 1].name
      : 'Current Folder';

    // Create a FileItem for the current folder
    const currentFolder: FileItem = {
      id: this.currentFolderId,
      name: currentFolderName,
      type: 'folder',
      modified: ''
    };

    this.selectedFolder = currentFolder;
    this.showUploadModal = true;
    this.selectedFile = null;
    this.uploadError = null;
    this.uploadProgress = 0;
  }

  /**
   * Handle file selection
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      this.uploadError = null;
    }
  }

  /**
   * Upload file to folder
   */
  uploadFile(): void {
    if (!this.selectedFile || !this.selectedFolder) {
      this.uploadError = 'Please select a file to upload';
      return;
    }

    // Validate file size (e.g., max 100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (this.selectedFile.size > maxSize) {
      this.uploadError = 'File size exceeds 100MB limit';
      return;
    }

    this.isUploading = true;
    this.uploadError = null;
    this.uploadProgress = 0;

    this.folderService.uploadFile(
      this.storageId,
      this.selectedFolder.id,
      this.selectedFile
    ).subscribe({
      next: (response) => {
        console.log('File uploaded successfully:', response);
        this.uploadProgress = 100;

        // Close modal after a short delay
        setTimeout(() => {
          this.closeUploadModal();
          // Reload current folder contents to show the new file
          this.loadFolderContents();
        }, 500);
      },
      error: (error) => {
        console.error('Error uploading file:', error);
        this.uploadError = error.message || 'Failed to upload file. Please try again.';
        this.isUploading = false;
        this.uploadProgress = 0;
      }
    });
  }

  /**
   * Get file size display for selected file
   */
  get selectedFileSize(): string {
    return this.selectedFile ? this.formatFileSize(this.selectedFile.size) : '';
  }

  /**
   * Check if upload is valid
   */
  get canUpload(): boolean {
    return !!this.selectedFile && !this.isUploading;
  }
}


