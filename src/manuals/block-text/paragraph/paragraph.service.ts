import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Paragraph} from "./paragraph.model";
import {ParagraphDto} from "./dto/paragraph.dto";

@Injectable()
export class ParagraphService {
    constructor(@InjectModel(Paragraph) private paragraphRepository: typeof Paragraph) {}

    async create(dto: ParagraphDto) {
        try {
            const paragraph = await this.paragraphRepository.create(dto)
            return paragraph
        } catch (e) {
            throw new HttpException({message: '[TextParagraph]:  Create error'} +e, HttpStatus.BAD_REQUEST)

        }
    }

    async getAllByTextId(id) {
        try {
            const paragraph = await this.paragraphRepository.findAll({where: {blockTextId: id}, include: {all: true}})
            return paragraph
        } catch (e) {
            throw new HttpException({message: '[textParagraphGetByTextId]:  Request error'} + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getAll() {
        try {
            const paragraph = await this.paragraphRepository.findAll({include: {all: true}})
            return paragraph
        } catch (e) {
            throw new HttpException({message: '[textParagraphGetAll]:  Request error'} + e, HttpStatus.BAD_REQUEST)
        }
    }

}
