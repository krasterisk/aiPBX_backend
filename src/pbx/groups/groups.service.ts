import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Group} from "./group.model";
import {GroupDto} from "./dto/group.dto";

@Injectable()
export class GroupsService {
    
    constructor(@InjectModel(Group) private groupRepository: typeof Group) {}

    async create(dto: GroupDto) {
        try {
            const group = await this.groupRepository.create(dto)
            return group
        } catch (e) {
            throw new HttpException('[group]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Group>) {
        const group = await this.groupRepository.findByPk(updates.id)
        if (!group) {
            throw new HttpException('group not found', HttpStatus.NOT_FOUND)
        }
        await group.update(updates)
        return group
    }

    async getAll() {
        try {
            const group = await this.groupRepository.findAll()
            if (group) {
                return group
            }

        } catch (e) {
            throw new HttpException({message: '[group]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(ids: number[]) {
        const deleted = await this.groupRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('Group not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'Group deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getGroupById(id: number) {
        const group = await this.groupRepository.findOne({where: {id}})
        if(!group) {
            throw new HttpException('group not found', HttpStatus.NOT_FOUND)
        } else {
            return group
        }
    }
    
    
}
