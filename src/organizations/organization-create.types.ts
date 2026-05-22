import { Organization } from './organizations.model';
import { OrganizationEdoStatusDto } from './organization-edo.service';

export type CreateOrganizationEdoResult =
    | { success: true; edo: OrganizationEdoStatusDto }
    | { success: false; error: string };

export type CreateOrganizationResult = {
    organization: Organization;
    edo?: CreateOrganizationEdoResult;
};
