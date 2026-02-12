import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked, MarkedOptions, Renderer, Tokens } from 'marked';

@Pipe({
  name: 'markdown',
  standalone: true
})
export class MarkdownPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  constructor() {
    this.configureMarked();
  }

  private configureMarked(): void {
    const renderer = new Renderer();

    // Custom code block renderer with copy button placeholder
    renderer.code = (token: Tokens.Code): string => {
      const language = token.lang || 'plaintext';
      const escapedCode = this.escapeHtml(token.text);
      return `
        <div class="code-block">
          <div class="code-header">
            <span class="code-language">${language}</span>
            <button class="copy-code-btn" onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').textContent)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z" fill="currentColor"/>
              </svg>
              Copy
            </button>
          </div>
          <pre><code class="language-${language}">${escapedCode}</code></pre>
        </div>
      `;
    };

    // Custom inline code renderer
    renderer.codespan = (token: Tokens.Codespan): string => {
      return `<code class="inline-code">${this.escapeHtml(token.text)}</code>`;
    };

    // Custom link renderer (open in new tab)
    renderer.link = (token: Tokens.Link): string => {
      const titleAttr = token.title ? ` title="${token.title}"` : '';
      return `<a href="${token.href}"${titleAttr} target="_blank" rel="noopener noreferrer">${token.text}</a>`;
    };

    // Custom table renderer with enhanced formatting
    renderer.table = (token: Tokens.Table): string => {
      // Format header cells
      const headerCells = token.header.map(cell => {
        const text = cell.text.trim();
        return `<th>${text}</th>`;
      }).join('');

      // Format body rows with smart cell formatting
      const bodyRows = token.rows.map(row => {
        const cells = row.map((cell, index) => {
          let content = cell.text.trim();
          let alignment = '';

          // Handle null/undefined values
          if (!content || content.toLowerCase() === 'null' || content.toLowerCase() === 'undefined') {
            content = '0';
          }

          // Detect if content is numeric (including formatted numbers)
          const isNumeric = this.isNumericContent(content);

          if (isNumeric) {
            // Format large numbers with thousand separators
            content = this.formatNumber(content);
            alignment = ' align="right"';
          }

          return `<td${alignment}>${content}</td>`;
        }).join('');

        return `<tr>${cells}</tr>`;
      }).join('');

      return `
        <div class="table-wrapper">
          <table>
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
      `;
    };

    // Custom blockquote renderer
    renderer.blockquote = (token: Tokens.Blockquote): string => {
      return `<blockquote class="markdown-blockquote">${token.text}</blockquote>`;
    };

    const options: MarkedOptions = {
      renderer,
      gfm: true, // GitHub Flavored Markdown
      breaks: true, // Convert \n to <br>
      async: false
    };

    marked.setOptions(options);
  }

  private escapeHtml(text: string): string {
    const htmlEscapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, char => htmlEscapes[char]);
  }

  /**
   * Check if content is numeric (integer or decimal)
   */
  private isNumericContent(content: string): boolean {
    // Remove common thousand separators and whitespace
    const cleaned = content.replace(/[,\s]/g, '');

    // Check if it's a valid number (including decimals)
    return /^-?\d+\.?\d*$/.test(cleaned) && cleaned !== '';
  }

  /**
   * Format number with thousand separators and decimal handling
   */
  private formatNumber(content: string): string {
    // Remove existing formatting
    const cleaned = content.replace(/[,\s]/g, '');

    // Parse the number
    const num = parseFloat(cleaned);

    if (isNaN(num)) {
      return content; // Return original if not a valid number
    }

    // Check if it's a decimal number
    const hasDecimal = cleaned.includes('.');

    if (hasDecimal) {
      // Format with 2 decimal places for decimals
      return num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } else {
      // Format as integer with thousand separators
      return num.toLocaleString('en-US');
    }
  }

  transform(value: string | null | undefined): SafeHtml {
    if (!value) {
      return '';
    }

    try {
      const html = marked.parse(value) as string;
      return this.sanitizer.bypassSecurityTrustHtml(html);
    } catch (error) {
      console.error('Markdown parsing error:', error);
      return this.sanitizer.bypassSecurityTrustHtml(value);
    }
  }
}

