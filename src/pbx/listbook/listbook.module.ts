import {forwardRef, Module} from '@nestjs/common';
import { ListbookService } from './listbook.service';
import { ListbookController } from './listbook.controller';
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {Listbook} from "./listbook.model";

@Module({
  providers: [ListbookService],
  controllers: [ListbookController],
  imports: [
    SequelizeModule.forFeature([Listbook]),
    forwardRef(() => AuthModule)
  ],
})
export class ListbookModule {}
