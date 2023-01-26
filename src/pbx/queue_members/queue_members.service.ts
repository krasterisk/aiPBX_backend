import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {QueueMembers} from "./queue_members.model";
import {QueueMemberDto} from "./dto/queue_member.dto";

@Injectable()
export class QueueMembersService {
    
    constructor(@InjectModel(QueueMembers) private queueMembersRepository: typeof QueueMembers) {}

    async create(dto: QueueMemberDto) {
        try {
            const queueMember = await this.queueMembersRepository.create(dto)
            return queueMember
        } catch (e) {
            throw new HttpException('[queueMember]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<QueueMembers>) {
        const queueMember = await this.queueMembersRepository.findByPk(updates.uniqueid)
        if (!queueMember) {
            throw new HttpException('queueMember not found', HttpStatus.NOT_FOUND)
        }
        await queueMember.update(updates)
        return queueMember
    }

    async getAll() {
        try {
            const queueMember = await this.queueMembersRepository.findAll()
            if (queueMember) {
                return queueMember
            }

        } catch (e) {
            throw new HttpException({message: '[queueMember]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(ids: number[]) {
        const deleted = await this.queueMembersRepository.destroy({where: { uniqueid: ids } })
        if(deleted === 0) {
            throw new HttpException('queueMember not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'queueMember deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getQueueMemberById(id: number) {
        const queueMember = await this.queueMembersRepository.findOne({where: {uniqueid: id}})
        if(!queueMember) {
            throw new HttpException('queueMember not found', HttpStatus.NOT_FOUND)
        } else {
            return queueMember
        }
    }
    
}
