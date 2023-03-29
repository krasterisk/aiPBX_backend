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
}
