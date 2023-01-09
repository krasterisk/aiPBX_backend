import {SetMetadata} from "@nestjs/common";

export const VPBX_KEY = 'vpbx_user_id'

export const VpbxId = (vpbx_user_id: number) => SetMetadata(VPBX_KEY, vpbx_user_id)


