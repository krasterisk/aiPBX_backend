import {Injectable} from '@nestjs/common';
import * as ami from 'asterisk-manager';

@Injectable()
export class AmiService {

    private client: ami;

    constructor() {
        this.client = new ami(
            process.env.AMI_PORT,
            process.env.AMI_HOST,
            process.env.AMI_USER,
            process.env.AMI_PASS,
            true
        );
        this.client.keepConnected();
    }

    public async origCall(exten: number, phone: number, user_uid: number) {
        return new Promise((resolve, reject) => {
            this.client.action({
                action: 'originate',
                channel: 'SIP/'+exten,
                callerid: phone,
                context: 'web_dial',
                exten: 'start',
                priority: 1,
                'variable':{
                    'SIPADDHEADER':'Call-Info: sip:\;answer-after=0',
                    'USER_UID': user_uid,
                    'CLIENTPHONE': phone,
                }
            }, (err, response) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(response);
                }
            });
        });
    }

    public async hangupCall(channel: string) {
        return new Promise((resolve, reject) => {
            this.client.hangup({
                channel,
            }, (err, response) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(response);
                }
            });
        });
    }

}
