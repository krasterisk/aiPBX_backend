import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Route} from "./routes.model";
import {RoutesDto} from "../routes/dto/routes.dto";
import {ExtensionDto} from "../extensions/dto/extension.dto";
import {ExtensionsService} from "../extensions/extensions.service";

@Injectable()
export class RoutesService {

    constructor(@InjectModel(Route) private routesRepository: typeof Route,
                private extenService: ExtensionsService) {}

    async create(dto: RoutesDto) {
        try {
            const route = await this.routesRepository.create(dto)
            if(!route) {
                throw new HttpException('[Routes]:  Request error', HttpStatus.BAD_REQUEST)
            }
            if(dto.extensions) {
                dto.extensions.map(async (extension:ExtensionDto) => {
                    const exten = await this.extenService.create(extension)
                    if(!exten) {
                        throw new HttpException('[ExtensionsRoutes]:  Request error', HttpStatus.BAD_REQUEST)
                    }
                    await route.$set('extensions', [exten.id])
                    route.extensions = [exten]
                    }
                )
            }
            return route

        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('Route already exists', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[Routes]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Route>) {
        const route = await this.routesRepository.findByPk(updates.id)
        if (!route) {
            throw new HttpException('Route not found', HttpStatus.NOT_FOUND)
        }
        await route.update(updates)
        return route
    }

    async delete(ids: number[]) {
        const deleted = await this.routesRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('Route not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'Route deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getAll() {
        try {
            const route = await this.routesRepository.findAll({include: {all: true}})
            if (route) {
                return route
            }

        } catch (e) {
            throw new HttpException({message: '[Routes]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async getRouteById(id: number) {
        const route = await this.routesRepository.findOne({where: {id}, include: {all: true}})
        if(!route) {
            throw new HttpException('Route not found', HttpStatus.NOT_FOUND)
        } else {
            return route
        }
    }


}
