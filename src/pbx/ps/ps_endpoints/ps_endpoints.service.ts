import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { PsEndpoint } from './ps_endpoints.model';

@Injectable()
export class PsEndpointsService {
  constructor(
    @InjectModel(PsEndpoint)
    private psEndpointModel: typeof PsEndpoint,
  ) {}

  async findAll(): Promise<PsEndpoint[]> {
    return this.psEndpointModel.findAll();
  }

  async findOne(id: string): Promise<PsEndpoint> {
    return this.psEndpointModel.findOne({ where: { id } });
  }

  async create(psEndpoint: PsEndpoint): Promise<PsEndpoint> {
    return this.psEndpointModel.create(psEndpoint);
  }

  async update(id: string, psEndpoint: PsEndpoint): Promise<[number, PsEndpoint[]]> {
    return this.psEndpointModel.update(psEndpoint, { where: { id } });
  }

  async delete(id: string): Promise<void> {
    const psEndpoint = await this.findOne(id);
    if (psEndpoint) {
      await psEndpoint.destroy();
    }
  }
}
