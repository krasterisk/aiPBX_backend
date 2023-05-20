import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {HashtagDto} from "./dto/hashtag.dto";
import {Hashtags} from "./hashtags.model";

@Injectable()
export class HashtagsService {
    constructor(@InjectModel(Hashtags) private hashtagRepository: typeof Hashtags) {
    }

    async create(dto: HashtagDto) {
        try {
            const text = await this.hashtagRepository.create(dto)
            return text
        } catch (e) {
            throw new HttpException({message: '[Post Hashtag]:  Create error'} +e, HttpStatus.BAD_REQUEST)

        }
    }

    async delete(ids: number[]) {
        try {
            await this.hashtagRepository.destroy({where: {postId: ids}})
        } catch (e) {
            throw new HttpException({message: '[blockHashtag]:  Delete error'} +e, HttpStatus.BAD_REQUEST)

        }
    }

}
