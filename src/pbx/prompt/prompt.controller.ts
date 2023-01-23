import { Controller } from '@nestjs/common';
import {ApiTags} from "@nestjs/swagger";

@ApiTags('Prompt')
@Controller('prompt')
export class PromptController {}
