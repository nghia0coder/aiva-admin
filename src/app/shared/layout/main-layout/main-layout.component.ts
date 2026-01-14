import { Component, ViewChild, AfterViewInit, ChangeDetectorRef } from '@angular/core';

import { RouterModule } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { ChatHistorySidebarComponent } from '../chat-history-sidebar/chat-history-sidebar.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterModule, HeaderComponent, SidebarComponent, ChatHistorySidebarComponent],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss']
})
export class MainLayoutComponent implements AfterViewInit {
  @ViewChild(SidebarComponent) sidebar?: SidebarComponent;
  isSidebarCollapsed = false;

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    // Manually trigger change detection after view is initialized
    // This prevents ExpressionChangedAfterItHasBeenCheckedError
    this.cdr.detectChanges();
  }

  get sidebarCollapsed(): boolean {
    return this.sidebar?.isCollapsed || false;
  }
}

