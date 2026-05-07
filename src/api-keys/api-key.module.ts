import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ApiKey } from './api-key.model';
import { ApiKeyService } from './api-key.service';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyController } from './api-key.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        SequelizeModule.forFeature([ApiKey]),
        AuthModule,
    ],
    controllers: [ApiKeyController],
    providers: [ApiKeyService, ApiKeyGuard],
    exports: [ApiKeyService, ApiKeyGuard],
})
export class ApiKeyModule {}
