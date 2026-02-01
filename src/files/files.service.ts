import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as uuid from 'uuid';
import sharp from 'sharp';

@Injectable()
export class FilesService {
    async createFile(file): Promise<string> {
        try {

            // console.log(path.extname(file))

            // const fileExt =
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
            throw new HttpException('Write file error' + e, HttpStatus.INTERNAL_SERVER_ERROR)
        }

    }
}
