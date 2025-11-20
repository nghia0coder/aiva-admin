import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface FileItem {
  id: number;
  name: string;
  type: 'folder' | 'file';
  size?: string;
  modified: string;
  icon?: string;
}

@Component({
  selector: 'app-storage',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './storage.component.html',
  styleUrls: ['./storage.component.scss']
})
export class StorageComponent {
  files: FileItem[] = [
    { id: 1, name: 'Documents', type: 'folder', modified: 'Today, 10:30 AM' },
    { id: 2, name: 'Images', type: 'folder', modified: 'Yesterday, 3:45 PM' },
    { id: 3, name: 'Project Proposal.pdf', type: 'file', size: '2.4 MB', modified: 'Nov 18, 2024', icon: 'pdf' },
    { id: 4, name: 'Presentation.pptx', type: 'file', size: '8.7 MB', modified: 'Nov 17, 2024', icon: 'pptx' },
    { id: 5, name: 'Budget.xlsx', type: 'file', size: '1.2 MB', modified: 'Nov 16, 2024', icon: 'xlsx' },
    { id: 6, name: 'Meeting Notes.docx', type: 'file', size: '456 KB', modified: 'Nov 15, 2024', icon: 'docx' }
  ];

  storageUsed = 45.8;
  storageTotal = 100;

  get storagePercentage(): number {
    return (this.storageUsed / this.storageTotal) * 100;
  }

  getFileIcon(file: FileItem): string {
    if (file.type === 'folder') return 'folder';
    return file.icon || 'file';
  }
}

