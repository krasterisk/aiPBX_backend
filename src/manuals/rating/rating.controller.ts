import {Body, Controller, Get, Param, Post, Query} from '@nestjs/common';
import {RatingService} from "./rating.service";
import {ApiOperation, ApiResponse} from "@nestjs/swagger";
import {RatingDto} from "./dto/rating.dto";
import {Rating} from "./rating.model";
import {getRatingDto} from "./dto/get-rating.dto";

@Controller('rating')
export class RatingController {
    constructor(private RatingService: RatingService) {}

    @ApiOperation({summary: "Create comment for postId"})
    @ApiResponse({status: 200, type: [Rating]})
    @Post()
    create(@Body() dto: RatingDto) {
        return this.RatingService.create(dto)
    }

    @ApiOperation({summary: "Get Rating by postId"})
    @ApiResponse({status: 200, type: [Rating]})
    // @Roles('ADMIN','USER')
    // @UseGuards(RolesGuard)
    @Get('/manual/:id')
    getByManualId(@Param('id') id: number) {
        return this.RatingService.getRatingByManualId(id)
    }

    @ApiOperation({summary: "Get Rating by userId"})
    @ApiResponse({status: 200, type: [Rating]})
    // @Roles('ADMIN','USER')
    // @UseGuards(RolesGuard)
    @Get('/user/:id')
    getByUserId(@Param('id') id: number) {
        return this.RatingService.getRatingByUserId(id)
    }

    @ApiOperation({summary: "Get Rating by postId and userId"})
    @ApiResponse({status: 200, type: [Rating]})
    // @Roles('ADMIN','USER')
    // @UseGuards(RolesGuard)
    @Get()
    getRating(@Query() dto: getRatingDto) {
       return this.RatingService.getRating(dto)
    }


}
