import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {ManualTextBlock} from "../posts/dto/create-post.dto";
import {Text} from "./block-text.model";

@Injectable()
export class BlockTextService {
    constructor(@InjectModel(Text) private blockTextRepository: typeof Text) {
    }

    async create(dto: ManualTextBlock) {
        try {
            const text = await this.blockTextRepository.create(dto)
            return text
        } catch (e) {
            throw new HttpException({message: '[blockText]:  Create error'} +e, HttpStatus.BAD_REQUEST)

        }
    }
}
