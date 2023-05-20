import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Rating} from "./rating.model";
import {RatingDto} from "./dto/rating.dto";
import {User} from "../../users/users.model";
import {Sequelize} from "sequelize-typescript";
import {getRatingDto} from "./dto/get-rating.dto";


@Injectable()
export class RatingService {

    constructor(@InjectModel(Rating) private ratingRepository: typeof Rating) {}

    async create(dto: RatingDto) {
        try {
            return await this.ratingRepository.create(dto)
        } catch (e) {
            throw new HttpException({message: '[ManualRating]:  Create error'} + e, HttpStatus.BAD_REQUEST)

        }
    }

    async getRatingByManualId(id) {
        try {
            return await this.ratingRepository.findAll({
                where: {postId: id}
            })
        } catch (e) {
            throw new HttpException({message: '[ManualRating]:  Request error'} + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getRatingByUserId(id) {
        try {
            return await this.ratingRepository.findAll({
                where: {userId: id}
            })
        } catch (e) {
            throw new HttpException({message: '[ManualRating]:  Request error'} + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getRating(dto) {
        try {
            return await this.ratingRepository.findAll({
                where: dto
            })
        } catch (e) {
            throw new HttpException({message: '[ManualRating]:  Request error'} + e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(ids: number[]) {
        try {
            await this.ratingRepository.destroy({where: {postId: ids}})
        } catch (e) {
            throw new HttpException({message: '[PostRating]:  Delete error'} +e, HttpStatus.BAD_REQUEST)

        }
    }

}
