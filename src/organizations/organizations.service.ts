import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from "@nestjs/sequelize";
import { Organization } from "./organizations.model";
import { CreateOrganizationDto } from "./dto/create-organization.dto";

@Injectable()
export class OrganizationsService {

    constructor(@InjectModel(Organization) private organizationRepository: typeof Organization) { }

    async create(userId: number, dto: CreateOrganizationDto) {
        try {
            const organization = await this.organizationRepository.create({ ...dto, userId });
            return organization;
        } catch (e) {
            throw new HttpException("Error creating organization", HttpStatus.BAD_REQUEST);
        }
    }

    async getAll(userId: number) {
        try {
            const organizations = await this.organizationRepository.findAndCountAll({
                where: { userId },
                order: [['createdAt', 'DESC']]
            });
            return organizations;
        } catch (e) {
            throw new HttpException("Error fetching organizations", HttpStatus.BAD_REQUEST);
        }
    }

    async getOne(userId: number, id: number) {
        const organization = await this.organizationRepository.findOne({ where: { id, userId } });
        if (!organization) {
            throw new HttpException("Organization not found", HttpStatus.NOT_FOUND);
        }
        return organization;
    }

    async update(userId: number, id: number, dto: CreateOrganizationDto) {
        const organization = await this.getOne(userId, id);
        await organization.update(dto);
        return organization;
    }

    async remove(userId: number, id: number) {
        const organization = await this.getOne(userId, id);
        await organization.destroy();
        return { message: "Organization deleted" };
    }
}
