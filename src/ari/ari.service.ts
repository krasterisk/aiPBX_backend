import {Injectable} from '@nestjs/common';
import { Endpoints } from "ari-client";
import axios from "axios";
import * as fs from "fs";
import * as util from "util";

@Injectable()
export class AriService {

    private client

    constructor() {

        const url = <string>process.env.ARI_URL
        const username = <string>process.env.ARI_USER;
        const password = <string>process.env.ARI_PASS;

        console.log('Данные для подключения: ' + `${url}` + `${username}` + `${password}`)
        const Ari = require('ari-client');
        Ari.connect(`${url}`, `${username}`, `${password}`)
            .then((ari) => {
                console.log("Успешно подключились к ARI")
            })
            .catch((err) => {
                console.log('Ошибка: ')
                return err
            })
//        this.client.on('StasisStart', this.handleCall.bind(this));
    }

    async onModuleInit() {
        this.client.on('StasisStart', this.handleCall.bind(this));
        console.log('Connected to ARI');
    }

    async handleCall(event: any, channel: any) {
        console.log(`Incoming call from ${channel.caller.number}`);

        // Включаем запись аудио
        const recording = await this.startRecording(channel.id);

        // Ждем окончания речи
        await this.waitForSpeechEnd(channel);

        // Завершаем запись
        await this.stopRecording(recording.name);

        // Отправляем аудио в Whisper
        const transcript = await this.transcribeAudio();

        // Генерируем ответ с ChatGPT
        const responseText = await this.getChatResponse(transcript);

        // Генерируем аудио с OpenAI TTS
        await this.textToSpeech(responseText);

        // Воспроизводим ответ в Asterisk
        await this.playResponse(channel);
    }

    async startRecording(channelId: string) {
        console.log('Starting recording...');
        return await this.client.recordings.record({
            format: 'wav',
            name: 'voicebot_input',
            maxDurationSeconds: 10,
            ifExists: 'overwrite',
            beep: false,
            terminateOn: 'silence',
        });
    }

    async stopRecording(recordingName: string) {
        console.log('Stopping recording...');
        await this.client.recordings.stop({ recordingName });
    }

    async waitForSpeechEnd(channel: any) {
        console.log('Waiting for speech to end...');
        await util.promisify(setTimeout)(3000); // Ждем 3 секунды (можно улучшить)
    }

    async transcribeAudio(): Promise<string> {
        console.log('Transcribing audio...');
        const audioBuffer = fs.readFileSync('/var/lib/asterisk/sounds/voicebot_input.wav');

        const response = await axios.post(
          'https://api.openai.com/v1/audio/transcriptions',
          audioBuffer,
          {
              headers: {
                  'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                  'Content-Type': 'audio/wav',
              },
          }
        );

        console.log(`Recognized text: ${response.data.text}`);
        return response.data.text;
    }

    async getChatResponse(text: string): Promise<string> {
        console.log(`Sending text to ChatGPT: ${text}`);

        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
              model: 'gpt-4',
              messages: [{ role: 'user', content: text }],
          },
          {
              headers: {
                  'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                  'Content-Type': 'application/json',
              },
          }
        );

        const reply = response.data.choices[0].message.content;
        console.log(`ChatGPT response: ${reply}`);
        return reply;
    }

    async textToSpeech(text: string) {
        console.log('Generating TTS audio...');

        const ttsResponse = await axios.post(
          'https://api.openai.com/v1/audio/speech',
          { model: 'tts-1', input: text, voice: 'alloy' },
          {
              headers: {
                  'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                  'Content-Type': 'application/json',
              },
              responseType: 'arraybuffer',
          }
        );

        fs.writeFileSync('/var/lib/asterisk/sounds/voicebot_response.wav', ttsResponse.data);
    }

    async playResponse(channel: any) {
        console.log('Playing response...');
        await channel.play({ media: 'sound:voicebot_response' });
    }

    public async getEndpoints(): Promise<Endpoints[]> {
        try {
            const endpoints_list = await this.client.endpoints.list()
            const endpoints = endpoints_list.map(endpoint => ({
                technology: endpoint.technology,
                resource: endpoint.resource,
                state: endpoint.state,
                channel_id: endpoint.channel_ids
            }))
            return endpoints
        } catch (e) {
            console.log("error: " + e)
        }
    }

}



