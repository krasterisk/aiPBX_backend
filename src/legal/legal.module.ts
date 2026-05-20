import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { LegalAcceptance } from './legal-acceptance.model';
import { LegalAcceptanceService } from './legal-acceptance.service';
import { LegalController } from './legal.controller';

@Module({
    imports: [
        SequelizeModule.forFeature([LegalAcceptance]),
        JwtModule.register({
            secret: process.env.PRIVATE_KEY || 'SECRET',
            signOptions: { expiresIn: '14d' },
        }),
    ],
    controllers: [LegalController],
    providers: [LegalAcceptanceService],
    exports: [LegalAcceptanceService],
})
export class LegalModule {}
