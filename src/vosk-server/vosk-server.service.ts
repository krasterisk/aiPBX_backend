import {Injectable, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import * as vosk from 'vosk';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class VoskServerService implements OnModuleInit, OnModuleDestroy {
    private model: vosk.Model;
    private recognizer: any;
    private buffer: Buffer = Buffer.alloc(0); // Инициализация пустого буфера
    private readonly BUFFER_THRESHOLD = 4000; // Пороговый размер буфера в байтах (например, 8 KB)
    private writeStream: fs.WriteStream;

    onModuleInit(): void {
        this.model = new vosk.Model('dist/vosk-model');
        this.recognizer = new vosk.Recognizer<any>({model: this.model, sampleRate: 16000});

        // Создание директории для хранения аудиофайлов, если она не существует
        const audioDir = path.join(__dirname, '..', 'audio_files');
        if (!fs.existsSync(audioDir)) {
            fs.mkdirSync(audioDir);
        }

        // Создание потока записи в файл
        const filePath = path.join(audioDir, `audio_${Date.now()}.wav`);
        this.writeStream = fs.createWriteStream(filePath);

    }

    async audioAppend(chunk: Buffer) {
        this.writeStream.write(chunk);

        this.buffer = Buffer.concat([this.buffer, chunk]);

        // Проверка, достиг ли буфер порогового значения
        if (this.buffer.length >= this.BUFFER_THRESHOLD) {
            if (this.recognizer.acceptWaveform(this.buffer)) {
                console.log(JSON.stringify(this.recognizer.result(), null, 4));
            } else {
                console.log(JSON.stringify(this.recognizer.partialResult(), null, 4));
            }
            this.buffer = Buffer.alloc(0)
            console.log(JSON.stringify(this.recognizer.finalResult(), null, 4));
        }
    }

    onModuleDestroy(): void {
        // Завершение записи и закрытие файла при уничтожении модуля
        if (this.writeStream) {
            this.writeStream.end();
        }
        this.model.free()
    }

}
