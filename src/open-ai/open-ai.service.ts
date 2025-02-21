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

    // constructor(private readonly aiRepository) {}

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


        // this.ws.send(JSON.stringify({type: 'input_audio_buffer.commit'}));
        // this.ws.send(JSON.stringify({type: 'response.create'}));

        const event = {
            type: "response.create",
            response: {
                modalities: ["audio", "text"],
                instructions: "Расскажи смешной стих",
            }
        };

    }
}
