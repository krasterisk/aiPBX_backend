import {forwardRef, Module} from '@nestjs/common';
import { AmiService } from './ami.service';
import {AmiController} from "./ami.controller";
import {AuthModule} from "../auth/auth.module";

@Module({
  controllers: [AmiController],
  providers: [AmiService],
  exports: [AmiService],
  imports: [
    forwardRef(() => AuthModule)
  ]
})

export class AmiModule {}
