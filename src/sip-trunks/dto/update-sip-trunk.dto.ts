import { PartialType } from '@nestjs/swagger';
import { CreateSipTrunkDto } from './create-sip-trunk.dto';

export class UpdateSipTrunkDto extends PartialType(CreateSipTrunkDto) { }
