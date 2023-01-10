import { Injectable } from '@nestjs/common';
import * as AriClient from 'ari-client'


@Injectable()
export class AriService {

    private ari: AriClient

    constructor() {
        AriClient.connect(
            process.env.ARI_URL,
            process.env.ARI_USER,
            process.env.ARI_PASS
        ).then((ari) => {
            this.ari = ari
        })
            .catch((err) => {
                console.log(err)
            })
    }

    public async getEndpoints() {
        const endpoints = await this.ari.endpoints.list()
        return endpoints
    }
}

