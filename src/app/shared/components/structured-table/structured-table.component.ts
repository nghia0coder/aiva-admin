import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StructuredDataEvent, ActionMetadata, TableRow, TableColumn } from '@/models/structured-response.models';

@Component({
    selector: 'app-structured-table',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './structured-table.component.html',
    styleUrls: ['./structured-table.component.scss']
})
export class StructuredTableComponent {
    @Input() tableData!: StructuredDataEvent;
    @Output() actionClick = new EventEmitter<ActionMetadata>();

    selectedRows: Set<string> = new Set();

    get displayedColumns(): string[] {
        return this.tableData?.columns?.map(col => col.key) || [];
    }

    getCellValue(row: TableRow, columnKey: string): any {
        return row.cells[columnKey];
    }

    getColumn(columnKey: string): TableColumn | undefined {
        return this.tableData?.columns?.find(col => col.key === columnKey);
    }

    getColumnType(columnKey: string): string {
        const column = this.getColumn(columnKey);
        return column?.type || 'Text';
    }

    onActionClick(action: ActionMetadata, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }

        if (action.isDisabled) {
            return;
        }

        this.actionClick.emit(action);
    }

    onRowSelect(rowId: string): void {
        if (this.selectedRows.has(rowId)) {
            this.selectedRows.delete(rowId);
        } else {
            this.selectedRows.add(rowId);
        }
    }

    isRowSelected(rowId: string): boolean {
        return this.selectedRows.has(rowId);
    }

    getSelectedProductIds(): string[] {
        return Array.from(this.selectedRows);
    }

    formatCurrency(value: number): string {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(value);
    }

    formatNumber(value: number): string {
        return new Intl.NumberFormat('vi-VN').format(value);
    }

    formatDate(value: string | Date): string {
        const date = typeof value === 'string' ? new Date(value) : value;
        return new Intl.DateTimeFormat('vi-VN').format(date);
    }

    trackByRowId(index: number, row: TableRow): string {
        return row.id;
    }

    trackByColumnKey(index: number, column: TableColumn): string {
        return column.key;
    }
}
