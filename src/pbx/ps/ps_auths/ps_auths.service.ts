import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { PsAuth } from './ps_auths.model';

@Injectable()
export class PsAuthsService {
  constructor(
    @InjectModel(PsAuth)
    private psAuthModel: typeof PsAuth,
  ) {}

  async findAll() {
    return this.psAuthModel.findAll();
  }

  async findOne(id: string) {
    return this.psAuthModel.findOne({ where: { id } });
  }

  async create(psAuth: PsAuth) {
    return this.psAuthModel.create(psAuth);
  }

  async update(id: string, psAuth: PsAuth) {
    return this.psAuthModel.update(psAuth, { where: { id } });
  }

  async delete(id: string): Promise<void> {
    const psAuth = await this.findOne(id);
    if (psAuth) {
      await psAuth.destroy();
    }
  }
}
