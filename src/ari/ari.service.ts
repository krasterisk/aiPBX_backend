import {Injectable, OnModuleInit} from '@nestjs/common';
import * as ari from 'ari-client';

@Injectable()
export class AriService implements OnModuleInit {

    private url = process.env.ARI_URL
    private username = process.env.ARI_USER;
    private password = process.env.ARI_PASS;

    async onModuleInit() {
        console.log('Данные для подключения: ' + `${this.url}` + `${this.username}` + `${this.password}`)
        ari.connect(this.url, this.username, this.password)
            .then((ari) => {
                ari.on('StasisStart', (event, incoming) => {
                        incoming.answer((err) => {
                            incoming.externalMedia({
                                app: 'voicebot',
                                external_host: '127.0.0.1:5005',
                                format: 'alaw'
                            })
                        // play(incoming, 'sound:hello-world', err)
                    })
                    // incoming.hangup()
                })

                // function play (channel, sound, callback) {
                //     var playback = ari.Playback();
                //
                //     playback.on('PlaybackFinished', function (event, playback) {
                //
                //         if (callback) {
                //             callback(null);
                //         }
                //     });
                //
                //     channel.play({media: sound}, playback);
                // }

                ari.start('voicebot')

            })
            .catch((err) => {
                console.log(err)
            })


    }

    public async getEndpoints() {
        // try {
        //     // const endpoints_list = await this.client.endpoints.list()
        //     return endpoints_list.map((endpoint: { technology: any; resource: any; state: any; channel_ids: any; }) => ({
        //         technology: endpoint.technology,
        //         resource: endpoint.resource,
        //         state: endpoint.state,
        //         channel_id: endpoint.channel_ids
        //     }))
        // } catch (e) {
        //     console.log("error: " + e)
        // }
    }

}



