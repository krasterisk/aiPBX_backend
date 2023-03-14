import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    UseGuards,
    UseInterceptors
} from '@nestjs/common';
import {ManualDto} from "./dto/create-post.dto";
import {PostsService} from "./posts.service";
import {FileInterceptor} from "@nestjs/platform-express";
import {ApiOperation, ApiResponse} from "@nestjs/swagger";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";

@Controller('posts')
export class PostsController {

    constructor(private postService: PostsService) {}

    @ApiOperation({summary: "Create Post"})
    @ApiResponse({status: 200, type: [Post]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Post()
    @UseInterceptors(FileInterceptor('image'))
    // create(@Body() dto: CreatePostDto,
    //            @UploadedFile() image) {
    create(@Body() dto: ManualDto) {
    return this.postService.create(dto)
    }

    @ApiOperation({summary: "Get Posts by id"})
    @ApiResponse({status: 200, type: [Post]})
    // @Roles('ADMIN','USER')
    // @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.postService.getPostById(id)
    }
    @ApiOperation({summary: "Get posts list"})
    @ApiResponse({status: 200, type: Post})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.postService.getAll()
    }

    @ApiOperation({summary: "Update post"})
    @ApiResponse({status: 200, type: Post})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: ManualDto) {
        return this.postService.update(dto)
    }

    @ApiOperation({summary: "Delete post"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.postService.delete(ids)
    }
}
