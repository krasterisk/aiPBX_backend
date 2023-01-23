import { Controller } from '@nestjs/common';
import {ApiTags} from "@nestjs/swagger";

@ApiTags('Time Groups')
@Controller('timegroup')
export class TimegroupController {}
