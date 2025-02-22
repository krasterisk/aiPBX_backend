import { Injectable, OnModuleInit } from '@nestjs/common';
import { WebSocket } from 'ws';

@Injectable()
export class OpenAiService implements OnModuleInit {
    private ws: WebSocket;
    private readonly API_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';
    private readonly API_KEY = process.env.OPENAI_API_KEY;
    private eventId: string

    onModuleInit() {
        this.connect();
    }

    private connect() {
        this.ws = new WebSocket(this.API_URL, {
            headers: {
                Authorization: `Bearer ${this.API_KEY}`,
                "OpenAI-Beta": "realtime=v1",
            },
        });

        this.ws.on('open', () => {
            console.log('WebSocket OpenAI connection established');
            this.updateSession()
            // this.ws.send(
                // JSON.stringify({
                //     type: "response.create",
                //     response: {
                //         modalities: ["audio", "text"],
                //         instructions: "You are a friendly assistant.",
                //         voice: "alloy",
                //         input_audio_format: "g711_alaw",
                //         output_audio_format: "g711_alaw",
                //         turn_detection: {
                //             type: "server_vad",
                //             threshold: 0.5,
                //             prefix_padding_ms: 300,
                //             silence_duration_ms: 500,
                //             create_response: true
                //         },
                //         temperature: 0.8,
                //         max_response_output_tokens: 1000
                //     }
                // })
            // );
        });

        this.ws.on('message', (data) => {
            console.log('Received:', data.toString());
        });

        this.ws.on('error', (error) => {
            console.error('WebSocket Error:', error);
        });

        this.ws.on('close', () => {
            console.log('WebSocket connection closed, reconnecting...');
            setTimeout(() => this.connect(), 5000);
        });
    }

    audioAppend(chunk: any) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: chunk
            }));
        }
    }
            updateSession() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const updatePayload = {
                // event_id: 'event_123',
                type: 'session.update',
                session: {
                    modalities: ['text', 'audio'],
                    instructions: 'You are a helpful assistant.',
                    voice: 'sage',
                    input_audio_format: 'g711_alaw',
                    output_audio_format: 'g711_alaw',
                    input_audio_transcription: {
                        model: 'whisper-1',
                        language: 'ru'
                    },
                    turn_detection: {
                        type: 'server_vad',
                        threshold: 0.5,
                        prefix_padding_ms: 300,
                        silence_duration_ms: 500,
                        create_response: true,
                    },
                    tools: [
                        {
                            type: 'function',
                            name: 'get_weather',
                            description: 'Get the current weather...',
                            parameters: {
                                type: 'object',
                                properties: {
                                    location: { type: 'string' },
                                },
                                required: ['location'],
                            },
                        },
                    ],
                    tool_choice: 'auto',
                    temperature: 0.8,
                    max_response_output_tokens: 'inf',
                },
            };

            this.ws.send(JSON.stringify(updatePayload));
            console.log('Session update sent:', updatePayload);
        } else {
            console.error('WebSocket is not open, cannot send session update');
        }
    }
}
