import {
    Body,
    Controller,
    Delete,
    ForbiddenException,
    Get,
    Headers,
    Param,
    Post,
    Put,
    Query,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Response } from 'express';
import { OrganizationsService } from "./organizations.service";
import { Organization } from "./organizations.model";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { Roles } from "../auth/roles-auth.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { LoggerService } from "../logger/logger.service";
import { InvoiceService } from "../accounting/invoice.service";
import { OrganizationDocumentsService } from "../accounting/organization-documents.service";

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationsController {

    constructor(
        private organizationService: OrganizationsService,
        private loggerService: LoggerService,
        private readonly invoiceService: InvoiceService,
        private readonly organizationDocumentsService: OrganizationDocumentsService,
    ) { }

    @ApiOperation({ summary: "Create Organization" })
    @ApiResponse({ status: 200, type: Organization })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post()
    async create(@Req() req: any, @Body() dto: CreateOrganizationDto) {
        let ownerId = Number(req.tokenUserId);
        if (dto.ownerUserId != null && dto.ownerUserId !== undefined) {
            if (!req.isAdmin) {
                throw new ForbiddenException('ownerUserId is allowed for admins only');
            }
            ownerId = Number(dto.ownerUserId);
        }
        const result = await this.organizationService.create(ownerId, dto);
        await this.loggerService.logAction(Number(req.tokenUserId), 'create', 'organization', result?.id || null, `Created organization "${dto.name || ''}" for user ${ownerId}`, null, dto, req);
        return result;
    }

    @ApiOperation({
        summary: 'Get organizations',
        description:
            'Always scoped by the authenticated user. Optional query `userId` is applied only for ADMIN to list another tenant\'s organizations; for non-admins the query is ignored and the user id is taken from the JWT.',
    })
    @ApiResponse({ status: 200, type: [Organization] })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get()
    getAll(@Req() req: any, @Query('userId') listUserId?: string) {
        const fromToken = Number(req.tokenUserId);
        if (req.isAdmin && listUserId != null && listUserId !== '') {
            return this.organizationService.getAll(Number(listUserId));
        }
        return this.organizationService.getAll(fromToken);
    }

    @ApiOperation({ summary: 'Resolved default nomenclature for invoices' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('default-subject')
    getDefaultSubject() {
        return { defaultSubject: this.invoiceService.getPublicDefaultSubject() };
    }

    @ApiOperation({ summary: 'Issue payment invoice (PDF)' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post(':id/invoices')
    async createInvoice(
        @Req() req: any,
        @Param('id') id: string,
        @Body() dto: CreateInvoiceDto,
        @Headers('host') host?: string,
        @Headers('x-forwarded-host') xfHost?: string,
    ) {
        const orgId = Number(id);
        const hostHeader = xfHost || host;
        const org = await this.organizationService.getOne(Number(req.tokenUserId), orgId, !!req.isAdmin);
        const result = await this.invoiceService.issueInvoice(
            {
                userId: Number(org.userId),
                organizationId: orgId,
                amountRub: dto.amountRub,
                subjectOverride: dto.subject,
            },
            hostHeader,
        );
        await this.loggerService.logAction(
            Number(req.tokenUserId),
            'create',
            'organization_invoice',
            orgId,
            `Issued invoice ${result.number}`,
            null,
            dto,
            req,
        );
        return result;
    }

    @ApiOperation({ summary: 'List organization documents' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get(':id/documents')
    listDocuments(@Req() req: any, @Param('id') id: string) {
        return this.organizationDocumentsService.listForOrganization(
            Number(req.tokenUserId),
            Number(id),
            !!req.isAdmin,
        );
    }

    @ApiOperation({ summary: 'Download document PDF' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get(':id/documents/:docId/pdf')
    async getDocumentPdf(
        @Req() req: any,
        @Param('id') id: string,
        @Param('docId') docId: string,
        @Res() res: Response,
    ) {
        await this.organizationDocumentsService.streamPdf(
            Number(req.tokenUserId),
            Number(id),
            docId,
            res,
            !!req.isAdmin,
        );
    }

    @ApiOperation({ summary: 'Retry SBIS for document' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post(':id/documents/:docId/resend-sbis')
    resendSbis(@Req() req: any, @Param('id') id: string, @Param('docId') docId: string) {
        return this.organizationDocumentsService.resendToSbis(Number(req.tokenUserId), Number(id), docId, !!req.isAdmin);
    }

    @ApiOperation({ summary: "Get One Organization" })
    @ApiResponse({ status: 200, type: Organization })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get(':id')
    getOne(@Req() req: any, @Param('id') id: string) {
        return this.organizationService.getOne(Number(req.tokenUserId), Number(id), !!req.isAdmin);
    }

    @ApiOperation({ summary: "Update Organization" })
    @ApiResponse({ status: 200, type: Organization })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Put(':id')
    async update(@Req() req: any, @Param('id') id: string, @Body() dto: CreateOrganizationDto) {
        const result = await this.organizationService.update(Number(req.tokenUserId), Number(id), dto, !!req.isAdmin);
        await this.loggerService.logAction(Number(req.tokenUserId), 'update', 'organization', Number(id), `Updated organization #${id}`, null, dto, req);
        return result;
    }

    @ApiOperation({ summary: "Delete Organization" })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Delete(':id')
    async remove(@Req() req: any, @Param('id') id: string) {
        const result = await this.organizationService.remove(Number(req.tokenUserId), Number(id), !!req.isAdmin);
        await this.loggerService.logAction(Number(req.tokenUserId), 'delete', 'organization', Number(id), `Deleted organization #${id}`, null, null, req);
        return result;
    }
}
