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

    // Custom table renderer
    renderer.table = (token: Tokens.Table): string => {
      const headerCells = token.header.map(cell => `<th>${cell.text}</th>`).join('');
      const bodyRows = token.rows.map(row =>
        `<tr>${row.map(cell => `<td>${cell.text}</td>`).join('')}</tr>`
      ).join('');

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

