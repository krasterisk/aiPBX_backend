import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {ManualTextBlock} from "../posts/dto/create-post.dto";
import {Text} from "./block-text.model";
import {ParagraphService} from "./paragraph/paragraph.service";

@Injectable()
export class BlockTextService {
    constructor(@InjectModel(Text)
                private blockTextRepository: typeof Text,
                private paragraphService: ParagraphService
    ) {}

    async create(dto: ManualTextBlock) {
        try {
            const text = await this.blockTextRepository.create(dto)
            return text
        } catch (e) {
            throw new HttpException({message: '[blockText]:  Create error'} +e, HttpStatus.BAD_REQUEST)

        }
    }

    async getAllByIds(ids: number[]): Promise<number[]> {
        try {
            const texts = await this.blockTextRepository.findAll({
                where: {postId: ids}
            })
            let textIds = []
            texts.map(text => textIds.push(text.id))
            return textIds
        } catch (e) {
            throw new HttpException({message: '[blockText]:  Request error'} + e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(ids: number[]) {
        try {
            const texts = await this.blockTextRepository.findAll({
                where: {postId: ids}
            })
            let textIds = []
            texts.map(text => textIds.push(text.id))
            await this.paragraphService.delete(textIds)
            await this.blockTextRepository.destroy({where: {postId: ids}})
        } catch (e) {
            throw new HttpException({message: '[blockText]:  Delete error'} +e, HttpStatus.BAD_REQUEST)

        }
    }

}
