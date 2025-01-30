import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { InjectModel } from '@nestjs/sequelize';
import { PsAor } from './ps_aors.model';

@Injectable()
export class PsAorsService {
  constructor(
    @InjectModel(PsAor)
    private psAorModel: typeof PsAor,
  ) {}

  async findAll() {
    return this.psAorModel.findAll();
  }

  async findOne(id: string) {
    return this.psAorModel.findOne({ where: { id } });
  }

  async create(psAor: PsAor) {
    return this.psAorModel.create(psAor);
  }

  async update(id: string, psAor: PsAor) {
     const aor = await this.psAorModel.findByPk(psAor.id)
    if(!aor) {
        throw new HttpException('provisioning template not found', HttpStatus.NOT_FOUND)
    }
    return this.psAorModel.update(psAor, { where: { id } });
  }

  async delete(id: string) {
    const psAor = await this.findOne(id);
    if (psAor) {
      await psAor.destroy();
    }
  }
}
