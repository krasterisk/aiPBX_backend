import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as uuid from 'uuid';
import sharp from 'sharp';

@Injectable()
export class FilesService {
    async createFile(file): Promise<string> {
        try {
            const fileName = uuid.v4() + '.jpg'
            const filePath = path.resolve(process.cwd(), 'static')
            if (!fs.existsSync(filePath)) {
                fs.mkdirSync(filePath, { recursive: true })
            }

            const compressedBuffer = await sharp(file.buffer)
                .jpeg({ quality: 60 }) // Настройка качества сжатия
                .toBuffer();

            fs.writeFileSync(path.join(filePath, fileName), compressedBuffer)
            return fileName
        } catch (e) {
            throw new HttpException('Write file error ' + e, HttpStatus.INTERNAL_SERVER_ERROR)
        }
    }

    async uploadTtsVoice(file): Promise<string> {
        try {
            const fileName = uuid.v4() + '.wav';
            // Save to /app/tts_voices, which will be volume-mounted and shared with omnivoice-tts
            const basePath = process.cwd(); // Should be /app/aiPBX_backend in docker
            const dirPath = path.resolve(basePath, 'tts_voices');
            
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }

            const activeFilePath = path.join(dirPath, fileName);
            fs.writeFileSync(activeFilePath, file.buffer);

            // omnivoice-tts container expects files in /app/voices/ 
            // since we'll mount the same volume `tts-voices-data` there.
            // Returning the path as omnivoice container sees it:
            return `/app/voices/${fileName}`;
        } catch (e) {
            throw new HttpException('Write tts voice file error: ' + e, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    deleteTtsVoice(voicePath: string) {
        if (!voicePath || !voicePath.startsWith('/app/voices/')) return;
        
        try {
            const fileName = path.basename(voicePath);
            const basePath = process.cwd();
            const filePath = path.resolve(basePath, 'tts_voices', fileName);
            
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (e) {
            console.error('Failed to delete old TTS voice file:', e);
        }
    }
}
