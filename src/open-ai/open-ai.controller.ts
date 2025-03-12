import { Body, Controller, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
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
     return this.openAiService.updateRtAudioSession()
  }

}
