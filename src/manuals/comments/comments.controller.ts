import {Body, Controller, Get, Param, Post} from '@nestjs/common';
import {CommentsService} from "./comments.service";
import {ApiOperation, ApiResponse} from "@nestjs/swagger";
import {CommentDto} from "./dto/comment.dto";
import {Comments} from "./comments.model";

@Controller('comments')
export class CommentsController {
    constructor(private commentsService: CommentsService) {}

    @ApiOperation({summary: "Create comment for postId"})
    @ApiResponse({status: 200, type: [Comments]})
    @Post()
    create(@Body() dto: CommentDto) {
        return this.commentsService.create(dto)
    }

    @ApiOperation({summary: "Get comments by postId"})
    @ApiResponse({status: 200, type: [Comments]})
    // @Roles('ADMIN','USER')
    // @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.commentsService.getCommentsByManualId(id)
    }



}
