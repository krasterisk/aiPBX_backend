import {Injectable} from '@nestjs/common';
import {Endpoints} from "ari-client";
import axios from "axios";
import * as fs from "fs";

@Injectable()
export class AriService {

    private client: any
    private activePlayback: any = null;
    private isSpeaking = false;  // Флаг, говорит ли сейчас бот

    constructor() {

        const url = <string>process.env.ARI_URL
        const username = <string>process.env.ARI_USER;
        const password = <string>process.env.ARI_PASS;

        console.log('Данные для подключения: ' + `${url}` + `${username}` + `${password}`)
        const Ari = require('ari-client');
        Ari.connect(`${url}`, `${username}`, `${password}`)
            .then((ari: any) => {
                this.client = ari
                console.log("Успешно подключились к ARI")
                this.client.on('StasisStart', this.handleCall.bind(this));
                this.client.start('voicebot');
            })
            .catch((err: string) => {
                console.log('Ошибка: '+err)
                return err
            })
        // this.client.on();
    }
    // async onModuleInit() {
    //     this.client.start('StasisStart', this.handleCall.bind(this));
    //     console.log('Connected to ARI');
    // }

    async handleCall(event: any, channel: any) {
        console.log(`Incoming call from ${channel.caller.number}`);

        // Запускаем потоковое получение аудио
        await this.startListening(channel);

        // Отправляем приветственное сообщение
        if (!this.isSpeaking) {
            this.isSpeaking = true;
            await this.speak(channel, "Привет! Как я могу помочь?");
            this.isSpeaking = false;
        }
    }

    async startListening(channel: any) {
        console.log('Listening for speech...');

        const bridge = await this.client.bridges.create({ type: 'mixing' });
        await bridge.addChannel({ channel: channel.id });

        const snoop = await this.client.channels.snoopChannel({
            app: 'voicebot',
            channelId: channel.id,
            spy: 'in',
            whisper: 'none',
        });

        snoop.on('ChannelTalkingStarted', async () => {
            console.log('User started talking. Stopping bot response.');
            if (this.activePlayback) {
                await this.activePlayback.stop();
                this.activePlayback = null;
            }
            this.isSpeaking = false;  // Разрешаем боту говорить снова после ответа пользователя
        });

        snoop.on('ChannelTalkingFinished', async () => {
            console.log('User stopped talking. Processing response...');
            const transcript = await this.transcribeAudio();
            const responseText = await this.getChatResponse(transcript);
            await this.speak(channel, responseText);
        });
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

    async speak(channel: any, text: string) {
        if (this.isSpeaking) return;  // Защита от зацикливания
        console.log(`Speaking: ${text}`);

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

        const filePath = '/var/lib/asterisk/sounds/voicebot_response.wav';
        fs.writeFileSync(filePath, ttsResponse.data);

        this.isSpeaking = true;
        this.activePlayback = await channel.play({ media: `sound:voicebot_response` });
        this.activePlayback.once('PlaybackFinished', () => {
            this.isSpeaking = false;
        });
    }

    public async getEndpoints(): Promise<Endpoints[]> {
        try {
            const endpoints_list = await this.client.endpoints.list()
            return endpoints_list.map((endpoint: { technology: any; resource: any; state: any; channel_ids: any; }) => ({
                technology: endpoint.technology,
                resource: endpoint.resource,
                state: endpoint.state,
                channel_id: endpoint.channel_ids
            }))
        } catch (e) {
            console.log("error: " + e)
        }
    }

}



