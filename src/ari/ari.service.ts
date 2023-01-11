import {Injectable} from '@nestjs/common';
import {Endpoint, Endpoints} from "ari-client";
import {ensureProgram} from "ts-loader/dist/utils";

@Injectable()
export class AriService {

    private client

    constructor() {

        const url = <string>process.env.ARI_URL
        const username = <string>process.env.ARI_USER;
        const password = <string>process.env.ARI_PASS;

        console.log('Данные для подкючения: ' + `${url}` + `${username}` + `${password}`)
        const Ari = require('ari-client');
        Ari.connect(`${url}`, `${username}`, `${password}`)
            .then((ari) => {
                this.client = ari;
                console.log("Успешно подключились к ARI")
            })
            .catch((err) => {
                console.log('Ошибка: ')
                return err
            })
    }

    public async getEndpoints(): Promise<Endpoints[]> {
        try {
            const endpoints_list = await this.client.endpoints.list()
            const endpoints = endpoints_list.map(endpoint => ({
                technology: endpoint.technology,
                resource: endpoint.resource,
                state: endpoint.state,
                channel_id: endpoint.channel_ids
            }))
            return endpoints
        } catch (e) {
            console.log("error: " + e)
        }
    }

}



