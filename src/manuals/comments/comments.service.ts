import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Comments} from "./comments.model";
import {CommentDto} from "./dto/comment.dto";
import {User} from "../../users/users.model";
import {Sequelize} from "sequelize-typescript";


@Injectable()
export class CommentsService {

    constructor(@InjectModel(Comments) private commentsRepository: typeof Comments) {
    }

    async create(dto: CommentDto) {
        try {
            return await this.commentsRepository.create(dto)
        } catch (e) {
            throw new HttpException({message: '[ManualComments]:  Create error'} + e, HttpStatus.BAD_REQUEST)

        }
    }

    async getCommentsByManualId(id) {
        try {
            return await this.commentsRepository.findAll({
                where: {postId: id},
                include: {
                    model: User,
                    where: {
                        id: Sequelize.col('userId')
                    }
                }
            })
        } catch (e) {
            throw new HttpException({message: '[ManualComments]:  Request error'} + e, HttpStatus.BAD_REQUEST)
        }
    }
}
