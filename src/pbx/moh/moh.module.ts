import {forwardRef, Module} from '@nestjs/common';
import { MohController } from './moh.controller';
import { MohService } from './moh.service';
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {Moh} from "./moh.model";

@Module({
  controllers: [MohController],
  providers: [MohService],
  imports: [
    SequelizeModule.forFeature([Moh]),
    forwardRef(() => AuthModule)
  ],
})
export class MohModule {}
