import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {ManualImageBlock} from "../posts/dto/create-post.dto";
import {Image} from "./block-image.model";

@Injectable()
export class BlockImageService {
    constructor(@InjectModel(Image) private blockImageRepository: typeof Image) {
    }

    async create(dto: ManualImageBlock) {
        try {
            const image = await this.blockImageRepository.create(dto)
            return image
        } catch (e) {
            throw new HttpException({message: '[blockImage]:  Create error'} +e, HttpStatus.BAD_REQUEST)

        }
    }

    async delete(ids: number[]) {
        try {
            await this.blockImageRepository.destroy({where: {id: ids}})
        } catch (e) {
            throw new HttpException({message: '[blockImage]:  Delete error'} +e, HttpStatus.BAD_REQUEST)

        }
    }

    async getAllById(id) {
        try {
            const image = await this.blockImageRepository.findAll({where: id})
            return image
        } catch (e) {
            throw new HttpException({message: '[blockImage]:  Request error'} + e, HttpStatus.BAD_REQUEST)
        }
    }

}
