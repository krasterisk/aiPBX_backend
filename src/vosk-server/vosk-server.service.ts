import {Injectable, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import * as vosk from 'vosk-koffi';

interface recText {
    text: string
}

@Injectable()
export class VoskServerService implements OnModuleInit, OnModuleDestroy {
    private model: vosk.Model;
    private speakerModel: vosk.SpeakerModel;
    private recognizer: any;
    private buffer: Buffer = Buffer.alloc(0); // Инициализация пустого буфера
    private readonly BUFFER_THRESHOLD = 8000; // Пороговый размер буфера в байтах (например, 8 KB)

    onModuleInit(): void {
        this.model = new vosk.Model('dist/vosk-model');
        this.speakerModel = new vosk.SpeakerModel('dist/vosk-model');
        this.recognizer = new vosk.Recognizer<any>({model: this.model, sampleRate: 16000});
    }

    async audioAppend(chunk: Buffer) {
        this.buffer = Buffer.concat([this.buffer, chunk]);

        // Проверка, достиг ли буфер порогового значения
        if (this.buffer.length >= this.BUFFER_THRESHOLD) {
            if (this.recognizer.acceptWaveform(this.buffer)) {
                const text: recText = this.recognizer.result()
                return text.text
                //console.log(JSON.stringify(this.recognizer.finalResult(), null, 4));
            } else {
  //              console.log(JSON.stringify(this.recognizer.partialResult(), null, 4));
            }
            this.buffer = Buffer.alloc(0)
//            console.log(JSON.stringify(this.recognizer.finalResult(), null, 4));
        }
    }

    async tts(input: recText) {

    }


    onModuleDestroy(): void {
        // Завершение записи и закрытие файла при уничтожении модуля
        this.model.free()
    }

}
