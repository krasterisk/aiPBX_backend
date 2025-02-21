import {HttpException, HttpStatus, Injectable, OnModuleInit} from "@nestjs/common";
import OpenAI from "openai";
import {openAiMessage} from "./dto/open-ai.dto";
import {encode} from 'base64-arraybuffer';
import {WebSocket} from 'ws';

@Injectable()
export class OpenAiService {

    private openai = new OpenAI({
        // baseURL: 'https://api.deepseek.com',
        baseURL: 'https://api.openai.com/v1',
        apiKey: process.env.OPEN_API_KEY
    });

    private ws: WebSocket

    // constructor(private readonly aiRepository) {}
    onModuleInit() {
        const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";

        try {
            this.ws = new WebSocket(url, {
                headers: {
                    "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
                    "OpenAI-Beta": "realtime=v1",
                },
            });

            this.ws.on('open', () => {
                console.log('Connected to WebSocket OpenAI Realtime API');
            });

            this.ws.on('message', (data) => {
                // Обработка полученных сообщений от OpenAI
                console.log('Received:', data.toString());
            });

        } catch (e) {
            console.log("error connect to realtime api")
        }

    }

    async request(messageDto: openAiMessage) {
        try {
            // const result = await this.openai.chat.completions.create(messageDto)
            // return result
        } catch (error) {
            throw new HttpException("[openAI]: request error" + error, HttpStatus.BAD_REQUEST);
        }
    }

    async stream(messageDto: openAiMessage) {
        try {
            // const stream = await this.openai.chat.completions.create({
            //     ...messageDto,
            //     stream: true
            // })
            // if (!stream[Symbol.asyncIterator]) {
            //     throw new Error("[openAI]: Returned stream is not an async iterable");
            // }

            // for await (const chunk of stream) {
            //     process.stdout.write(chunk.choices[0]?.delta?.content || "");
            // }
        } catch (error) {
            throw new HttpException("[openAI]: request error" + error, HttpStatus.BAD_REQUEST);
        }
    }

    public sendAudioData(audioData: any) {
        console.log(audioData)
        this.ws.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: audioData
        }));

        this.ws.send(JSON.stringify({type: 'input_audio_buffer.commit'}));
        this.ws.send(JSON.stringify({type: 'response.create'}));

        const event = {
            type: "response.create",
            response: {
                modalities: ["audio", "text"],
                instructions: "Расскажи смешной стих",
            }
        };

    }
}
