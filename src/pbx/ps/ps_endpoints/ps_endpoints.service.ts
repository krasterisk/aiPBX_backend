import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { PsEndpoint } from './ps_endpoints.model';

@Injectable()
export class PsEndpointsService {
  constructor(
    @InjectModel(PsEndpoint)
    private psEndpointModel: typeof PsEndpoint,
  ) {}

  async findAll() {
    return this.psEndpointModel.findAll();
  }

  async findOne(id: string) {
    return this.psEndpointModel.findOne({ where: { id } });
  }

  async create(psEndpoint: PsEndpoint) {
    return this.psEndpointModel.create(psEndpoint);
  }

  async update(id: string, psEndpoint: PsEndpoint) {
    return await this.psEndpointModel.update(psEndpoint, { where: { id } });
  }

  async delete(id: string) {
    const psEndpoint = await this.findOne(id);
    if (psEndpoint) {
      await psEndpoint.destroy();
    }
  }
}
