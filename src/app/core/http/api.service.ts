import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { from, Observable, throwError } from 'rxjs';
import { catchError, retry, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly http = inject(HttpClient);
    private readonly authService = inject(AuthService);
    private readonly baseUrl = environment.apiConfig.baseUrl;

    get<T>(endpoint: string): Observable<T> {
        return this.http.get<T>(`${this.baseUrl}${endpoint}`).pipe(
            retry({ count: 2, delay: 1000 }),
            catchError(this.handleError)
        );
    }

    post<T, R>(endpoint: string, body: T): Observable<R> {
        return this.http.post<R>(`${this.baseUrl}${endpoint}`, body).pipe(
            catchError(this.handleError)
        );
    }

    delete<T>(endpoint: string): Observable<T> {
        return this.http.delete<T>(`${this.baseUrl}${endpoint}`).pipe(
            catchError(this.handleError)
        );
    }

    /**
     * Server-Sent Events for streaming responses
     */
    stream<T>(endpoint: string, body: unknown): Observable<T> {
        // Get token first, then stream
        return from(this.getAccessToken()).pipe(
            switchMap(token => this.createStreamObservable<T>(endpoint, body, token))
        );
    }

    private async getAccessToken(): Promise<string> {
        try {
            const result = await this.authService.acquireTokenSilent(
                environment.apiConfig.scopes || []
            ).toPromise();
            return result?.accessToken || '';
        } catch {
            return '';
        }
    }

    private createStreamObservable<T>(
        endpoint: string,
        body: unknown,
        token: string
    ): Observable<T> {
        return new Observable<T>((observer) => {
            const controller = new AbortController();

            fetch(`${this.baseUrl}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            })
                .then(async (response) => {
                    if (!response.ok) {
                        const errorBody = await response.text();
                        throw new Error(errorBody || `HTTP error! status: ${response.status}`);
                    }

                    const reader = response.body?.getReader();
                    if (!reader) {
                        throw new Error('No response body');
                    }

                    const decoder = new TextDecoder();
                    let buffer = '';

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            if (!line.trim()) continue;

                            // Handle SSE format: "data: {...}"
                            const dataMatch = line.match(/^data:\s*(.+)$/m);
                            if (dataMatch) {
                                try {
                                    const data = JSON.parse(dataMatch[1]);

                                    // Check for completion signal
                                    if (data.isComplete || data.event === 'done') {
                                        observer.complete();
                                        return;
                                    }

                                    // Check for error
                                    if (data.error) {
                                        observer.error(new Error(data.error));
                                        return;
                                    }

                                    observer.next(data as T);
                                } catch (parseError) {
                                    // If it's plain text content (not JSON)
                                    observer.next({ content: dataMatch[1] } as T);
                                }
                            }
                        }
                    }
                    observer.complete();
                })
                .catch((error) => {
                    if (error.name !== 'AbortError') {
                        observer.error(error);
                    }
                });

            // Cleanup function - abort on unsubscribe
            return () => controller.abort();
        });
    }

    private handleError(error: HttpErrorResponse): Observable<never> {
        let errorMessage = 'An unexpected error occurred';

        if (error.error instanceof ErrorEvent) {
            errorMessage = error.error.message;
        } else {
            errorMessage = error.error?.message || `Error Code: ${error.status}`;
        }

        console.error('API Error:', errorMessage);
        return throwError(() => new Error(errorMessage));
    }
}