import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { PsAor } from './ps_aors.model';

@Injectable()
export class PsAorsService {
  constructor(
    @InjectModel(PsAor)
    private psAorModel: typeof PsAor,
  ) {}

  async findAll(): Promise<PsAor[]> {
    return this.psAorModel.findAll();
  }

  async findOne(id: string): Promise<PsAor> {
    return this.psAorModel.findOne({ where: { id } });
  }

  async create(psAor: PsAor): Promise<PsAor> {
    return this.psAorModel.create(psAor);
  }

  async update(id: string, psAor: PsAor): Promise<[number, PsAor[]]> {
    return this.psAorModel.update(psAor, { where: { id } });
  }

  async delete(id: string): Promise<void> {
    const psAor = await this.findOne(id);
    if (psAor) {
      await psAor.destroy();
    }
  }
}
