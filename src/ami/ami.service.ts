import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import AsteriskManager from 'asterisk-manager';

@Injectable()
export class AmiService implements OnModuleInit, OnModuleDestroy {
    private client: any;  // Fix TypeScript issue

    constructor() {
        this.connectAmi();
    }

    private connectAmi() {
        this.client = new (AsteriskManager as any)(
            Number(process.env.AMI_PORT),
            process.env.AMI_HOST,
            process.env.AMI_USER,
            process.env.AMI_PASS,
            true
        );

        this.client.on('disconnect', () => {
            console.error('AMI Disconnected. Attempting to reconnect...');
            setTimeout(() => this.connectAmi(), 5000); // Reconnect after 5 seconds
        });

        this.client.on('error', (err: Error) => {
            console.error('AMI Connection Error:', err);
        });

        this.client.on('connect', () => {
            console.log('Connected to AMI');
        });
    }

    public async origCall(exten: number, phone: number, user_uid: number) {
        return new Promise((resolve, reject) => {
            this.client.action({
                action: 'originate',
                channel: 'SIP/' + exten,
                callerid: phone,
                context: 'web_dial',
                exten: 'start',
                priority: 1,
                variable: {
                    'SIPADDHEADER': 'Call-Info: sip:;answer-after=0',
                    'USER_UID': user_uid,
                    'CLIENTPHONE': phone,
                }
            }, (err: Error, response: any) => {
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
            this.client.action({
                action: 'hangup',
                channel,
            }, (err: Error, response: any) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(response);
                }
            });
        });
    }

    onModuleDestroy() {
        if (this.client) {
            this.client.disconnect();
        }
    }

    onModuleInit() {
        console.log('AMI Service Initialized');
    }
}

