import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { PsEndpointsController } from './ps_endpoints/ps_endpoints.controller';
import { PsAorsController } from './ps_aors/ps_aors.controller';
import { PsAuthsController } from './ps_auths/ps_auths.controller';
import { PsEndpointsService } from './ps_endpoints/ps_endpoints.service';
import { PsAorsService } from './ps_aors/ps_aors.service';
import { PsAuthsService } from './ps_auths/ps_auths.service';
import { PsEndpoint } from './ps_endpoints/ps_endpoints.model';
import { PsAor } from './ps_aors/ps_aors.model';
import { PsAuth } from './ps_auths/ps_auths.model';

@Module({
  imports: [SequelizeModule.forFeature([PsEndpoint, PsAor, PsAuth])],
  controllers: [PsEndpointsController, PsAorsController, PsAuthsController],
  providers: [PsEndpointsService, PsAorsService, PsAuthsService],
})
export class PsModule {}
