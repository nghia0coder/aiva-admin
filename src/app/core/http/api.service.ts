import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, from, Observable, throwError } from 'rxjs';
import { catchError, retry, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { AuthService } from '../services/auth.service';

/**
 * API Service for making HTTP requests to the backend.
 * 
 * Note: For standard HTTP requests (get, post, delete), the MsalInterceptor
 * will automatically attach the access token to the Authorization header.
 * 
 * For streaming requests using fetch API, tokens are manually attached
 * as fetch API is not intercepted by Angular HTTP interceptors.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly http = inject(HttpClient);
    private readonly authService = inject(AuthService);
    private readonly baseUrl = environment.apiConfig.baseUrl;

    /**
     * GET request - Token automatically attached by MsalInterceptor
     */
    get<T>(endpoint: string): Observable<T> {
        return this.http.get<T>(`${this.baseUrl}${endpoint}`).pipe(
            retry({ count: 2, delay: 1000 }),
            catchError(this.handleError)
        );
    }

    /**
     * POST request - Token automatically attached by MsalInterceptor
     */
    post<T, R>(endpoint: string, body: T): Observable<R> {
        return this.http.post<R>(`${this.baseUrl}${endpoint}`, body).pipe(
            catchError(this.handleError)
        );
    }

    /**
     * DELETE request - Token automatically attached by MsalInterceptor
     */
    delete<T>(endpoint: string): Observable<T> {
        return this.http.delete<T>(`${this.baseUrl}${endpoint}`).pipe(
            catchError(this.handleError)
        );
    }

    /**
     * PUT request - Token automatically attached by MsalInterceptor
     */
    put<T, R>(endpoint: string, body: T): Observable<R> {
        return this.http.put<R>(`${this.baseUrl}${endpoint}`, body).pipe(
            catchError(this.handleError)
        );
    }

    /**
     * PATCH request - Token automatically attached by MsalInterceptor
     */
    patch<T, R>(endpoint: string, body: Partial<T>): Observable<R> {
        return this.http.patch<R>(`${this.baseUrl}${endpoint}`, body).pipe(
            catchError(this.handleError)
        );
    }

    /**
     * Server-Sent Events for streaming responses
     * 
     * Note: Uses fetch API which is not intercepted by Angular HTTP interceptors.
     * Therefore, we manually acquire and attach the token.
     */
    stream<T>(endpoint: string, body: unknown): Observable<T> {
        // Get token first, then stream
        return from(this.getAccessToken()).pipe(
            switchMap(token => {
                if (!token) {
                    return throwError(() => new Error('Failed to acquire access token. Please login again.'));
                }
                return this.createStreamObservable<T>(endpoint, body, token);
            }),
            catchError(this.handleError)
        );
    }

    /**
     * Acquire access token silently.
     * Automatically handles token refresh if needed.
     * 
     * @returns Promise resolving to the access token
     * @throws Error if token acquisition fails
     */
    private async getAccessToken(): Promise<string> {
        try {
            // Use firstValueFrom instead of deprecated toPromise()
            const result = await firstValueFrom(
                this.authService.acquireTokenSilent(environment.apiConfig.scopes || [])
            );

            if (!result?.accessToken) {
                throw new Error('No access token received');
            }

            return result.accessToken;
        } catch (error) {
            console.error('Failed to acquire access token:', error);
            throw error;
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

                            // Parse SSE event format
                            const eventMatch = line.match(/^event:\s*(.+)$/m);
                            const dataMatch = line.match(/^data:\s*(.+)$/m);

                            if (dataMatch) {
                                try {
                                    const data = JSON.parse(dataMatch[1]);
                                    const eventType = eventMatch ? eventMatch[1] : 'message';

                                    // Handle different event types
                                    if (eventType === 'done') {
                                        observer.next({
                                            type: 'done',
                                            data: data
                                        } as T);
                                        observer.complete();
                                        return;
                                    } else if (eventType === 'error') {
                                        observer.next({
                                            type: 'error',
                                            data: data
                                        } as T);
                                        observer.error(new Error(data.message || 'Stream error'));
                                        return;
                                    } else if (eventType === 'structured_data_start') {
                                        observer.next({
                                            type: 'structured_data_start',
                                            data: data
                                        } as T);
                                    } else if (eventType === 'structured_data_row') {
                                        observer.next({
                                            type: 'structured_data_row',
                                            data: data
                                        } as T);
                                    } else if (eventType === 'structured_data_complete') {
                                        observer.next({
                                            type: 'structured_data_complete',
                                            data: data
                                        } as T);
                                    } else if (eventType === 'chart') {
                                        observer.next({
                                            type: 'chart',
                                            data: data
                                        } as T);
                                    } else if (eventType === 'table') {
                                        // Handle table event (markdown table)
                                        observer.next({
                                            type: 'message',
                                            data: data
                                        } as T);
                                    } else {
                                        // Default 'message' event
                                        // Support both old format (direct data) and new format (wrapped in event)
                                        if (data.isComplete || data.complete) {
                                            observer.next({
                                                type: 'done',
                                                data: data
                                            } as T);
                                            observer.complete();
                                            return;
                                        }

                                        observer.next({
                                            type: 'message',
                                            data: data
                                        } as T);
                                    }
                                } catch (parseError) {
                                    // If it's plain text content (not JSON)
                                    observer.next({
                                        type: 'message',
                                        data: { content: dataMatch[1] }
                                    } as T);
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

    /**
     * Handle HTTP errors consistently across all requests
     */
    private handleError(error: HttpErrorResponse | Error): Observable<never> {
        let errorMessage = 'An unexpected error occurred';

        if (error instanceof HttpErrorResponse) {
            // HTTP Error Response
            if (error.error instanceof ErrorEvent) {
                // Client-side error
                errorMessage = error.error.message;
            } else {
                // Server-side error
                errorMessage = error.error?.message || error.message || `Error Code: ${error.status}`;

                // Handle authentication errors
                if (error.status === 401) {
                    errorMessage = 'Unauthorized. Please login again.';
                } else if (error.status === 403) {
                    errorMessage = 'Access forbidden. You do not have permission to perform this action.';
                } else if (error.status === 404) {
                    errorMessage = 'Resource not found.';
                } else if (error.status >= 500) {
                    errorMessage = 'Server error. Please try again later.';
                }
            }
        } else {
            // Generic Error
            errorMessage = error.message || 'An unexpected error occurred';
        }

        console.error('API Error:', errorMessage, error);
        return throwError(() => new Error(errorMessage));
    }
}