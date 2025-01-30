import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Roles } from "../auth/roles-auth.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { OpenAiService } from "./open-ai.service";
import { openAiMessage } from "./dto/open-ai.dto";

@Controller('open-ai')
export class OpenAiController {

  constructor(private openAiService: OpenAiService) {}

  @ApiOperation({summary: "Request to Ai"})
  @ApiResponse({status: 200, type: openAiMessage})
  // @Roles('ADMIN')
  // @UseGuards(RolesGuard)
  // @UsePipes(ValidationPipe)
  @Post()
  request(@Body() dto: openAiMessage) {
     return this.openAiService.request(dto)
  }

  @ApiOperation({summary: "Request to Ai"})
  @ApiResponse({status: 200, type: openAiMessage})
  // @Roles('ADMIN')
  // @UseGuards(RolesGuard)
  // @UsePipes(ValidationPipe)
  @Post('stream')
  stream(@Body() dto: openAiMessage) {
    return this.openAiService.stream(dto)
  }

}
