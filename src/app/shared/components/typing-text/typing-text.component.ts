import { Component, Input, OnChanges, SimpleChanges, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-typing-text',
    standalone: true,
    imports: [CommonModule],
    template: `{{ displayedText }}`,
    styles: [`:host { display: inline; }`]
})
export class TypingTextComponent implements OnChanges, OnDestroy {
    @Input() text: string = '';
    @Input() speed: number = 30; // ms per char

    displayedText: string = '';
    private timeoutId: any;

    constructor(private cdr: ChangeDetectorRef) { }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['text']) {
            const current = changes['text'].currentValue;
            const previous = changes['text'].previousValue;

            // If it's the first load (previous is undefined), show immediately
            // unless it's explicitly explicitly empty which shouldn't happen much for titles
            if (previous === undefined) {
                this.displayedText = current;
            } else if (current !== previous) {
                // If text changed, animate
                this.startTyping(current);
            }
        }
    }

    private startTyping(fullText: string): void {
        // Clear any existing typing
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }

        this.displayedText = '';
        let index = 0;

        const type = () => {
            if (index < fullText.length) {
                this.displayedText += fullText.charAt(index);
                index++;
                this.cdr.markForCheck();
                this.timeoutId = setTimeout(type, this.speed);
            }
        };

        type();
    }

    ngOnDestroy(): void {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }
    }
}
