import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Extensions} from "./extensions.model";
import {ExtensionDto} from "./dto/extension.dto";

@Injectable()
export class ExtensionsService {

    constructor(@InjectModel(Extensions) private extensRepository: typeof Extensions) {}

    async create(extenDto: ExtensionDto) {
        try {
            const exten = await this.extensRepository.create(extenDto)
            return exten
        } catch (e) {
            throw new HttpException('[Extensions]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async getAll() {
        try {
            const extens = await this.extensRepository.findAll()
            if (extens) {
                return extens
            }

        } catch (e) {
            throw new HttpException({message: '[Extensions]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }
}
