import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {ManualCodeBlock} from "../posts/dto/create-post.dto";
import {Code} from "./block-code.model";

@Injectable()
export class BlockCodeService {
    constructor(@InjectModel(Code) private blockCodeRepository: typeof Code) {}

    async create(dto: ManualCodeBlock) {
        try {
            const code = await this.blockCodeRepository.create(dto)
            return code
        } catch (e) {
            throw new HttpException({message: '[blockCode]:  Create error'} +e, HttpStatus.BAD_REQUEST)

        }
    }
}
