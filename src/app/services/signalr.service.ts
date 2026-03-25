import { Injectable, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Observable, Subject, filter } from 'rxjs';
import { MsalService } from '@azure/msal-angular';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { SignalRConnectionState, TitleUpdatedMessage } from '../models/chat.models';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SignalRService {
    private readonly msalService = inject(MsalService);
    private readonly destroyRef = inject(DestroyRef);

    // SignalR Hub Configuration
    private readonly hubUrl = environment.apiConfig.signalrHubUrl;
    private hubConnection: signalR.HubConnection | null = null;

    // Connection state management
    private connectionStateSubject = new BehaviorSubject<SignalRConnectionState>(
        SignalRConnectionState.Disconnected
    );
    connectionState$ = this.connectionStateSubject.asObservable();

    // Title update events
    private titleUpdatedSubject = new Subject<TitleUpdatedMessage>();
    titleUpdated$ = this.titleUpdatedSubject.asObservable();

    // Track if connection has been started
    private isStarted = false;

    constructor() {
        // Initialize connection when service is created
        this.initializeConnection();
    }

    /**
     * Initialize SignalR hub connection
     */
    private initializeConnection(): void {
        try {
            // Get access token from MSAL
            const account = this.msalService.instance.getActiveAccount();
            if (!account) {
                console.warn('No active MSAL account found. SignalR connection will not be established.');
                return;
            }

            // Build hub connection with token authentication
            this.hubConnection = new signalR.HubConnectionBuilder()
                .withUrl(this.hubUrl, {
                    accessTokenFactory: () => this.getAccessToken(),
                    skipNegotiation: false,
                    transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.ServerSentEvents
                })
                .withAutomaticReconnect({
                    nextRetryDelayInMilliseconds: (retryContext) => {
                        // Exponential backoff: 2s, 4s, 8s, 16s, 32s
                        if (retryContext.previousRetryCount >= 5) {
                            return null; // Stop retrying after 5 attempts
                        }
                        return Math.min(1000 * Math.pow(2, retryContext.previousRetryCount + 1), 32000);
                    }
                })
                .configureLogging(signalR.LogLevel.Information)
                .build();

            // Register event handlers
            this.registerEventHandlers();

            // Register connection lifecycle handlers
            this.registerConnectionHandlers();

            // Start connection
            this.startConnection();

        } catch (error) {
            console.error('Failed to initialize SignalR connection:', error);
            this.connectionStateSubject.next(SignalRConnectionState.Disconnected);
        }
    }

    /**
     * Get access token from MSAL for SignalR authentication
     */
    private async getAccessToken(): Promise<string> {
        try {
            const account = this.msalService.instance.getActiveAccount();
            if (!account) {
                throw new Error('No active account');
            }

            const result = await this.msalService.instance.acquireTokenSilent({
                scopes: environment.apiConfig.scopes,
                account: account
            });

            return result.accessToken;
        } catch (error) {
            if (error instanceof InteractionRequiredAuthError || (error as any).name === 'InteractionRequiredAuthError') {
                console.warn('Silent token acquisition failed, attempting interactive login...');
                const result = await this.msalService.instance.acquireTokenPopup({
                    scopes: environment.apiConfig.scopes
                });
                return result.accessToken;
            }
            console.error('Failed to acquire access token for SignalR:', error);
            throw error;
        }
    }

    /**
     * Register SignalR event handlers
     */
    private registerEventHandlers(): void {
        if (!this.hubConnection) return;

        // Handle TitleUpdated event from backend
        this.hubConnection.on('TitleUpdated', (message: TitleUpdatedMessage) => {
            console.log('Received TitleUpdated event:', message);
            this.titleUpdatedSubject.next(message);
        });
    }

    /**
     * Register connection lifecycle handlers
     */
    private registerConnectionHandlers(): void {
        if (!this.hubConnection) return;

        this.hubConnection.onreconnecting((error) => {
            console.warn('SignalR reconnecting...', error);
            this.connectionStateSubject.next(SignalRConnectionState.Reconnecting);
        });

        this.hubConnection.onreconnected((connectionId) => {
            console.log('SignalR reconnected. Connection ID:', connectionId);
            this.connectionStateSubject.next(SignalRConnectionState.Connected);
        });

        this.hubConnection.onclose((error) => {
            console.error('SignalR connection closed:', error);
            this.connectionStateSubject.next(SignalRConnectionState.Disconnected);
            this.isStarted = false;
        });
    }

    /**
     * Start SignalR connection
     */
    private async startConnection(): Promise<void> {
        if (!this.hubConnection || this.isStarted) return;

        try {
            this.connectionStateSubject.next(SignalRConnectionState.Connecting);
            await this.hubConnection.start();
            this.isStarted = true;
            this.connectionStateSubject.next(SignalRConnectionState.Connected);
            console.log('SignalR connected successfully');
        } catch (error) {
            console.error('Failed to start SignalR connection:', error);
            this.connectionStateSubject.next(SignalRConnectionState.Disconnected);
            this.isStarted = false;
        }
    }

    /**
     * Stop SignalR connection
     */
    async stopConnection(): Promise<void> {
        if (!this.hubConnection) return;

        try {
            await this.hubConnection.stop();
            this.isStarted = false;
            this.connectionStateSubject.next(SignalRConnectionState.Disconnected);
            console.log('SignalR connection stopped');
        } catch (error) {
            console.error('Failed to stop SignalR connection:', error);
        }
    }

    /**
     * Get current connection state
     */
    getConnectionState(): SignalRConnectionState {
        return this.connectionStateSubject.value;
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.connectionStateSubject.value === SignalRConnectionState.Connected;
    }
}
