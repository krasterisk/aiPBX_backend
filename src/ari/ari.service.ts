import {Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy} from '@nestjs/common';
import * as ariClient from 'ari-client';
import {WsServerGateway} from "../ws-server/ws-server.gateway";

@Injectable()
export class AriService implements OnModuleInit {
    private url = process.env.ARI_URL
    private username = process.env.ARI_USER;
    private password = process.env.ARI_PASS;
    private readonly logger = new Logger();
    private startingStream: boolean
    private bridge: ariClient.Bridge
    private externalChannel: ariClient.Channel
    private playback: ariClient.Playback

    constructor(
        @Inject(WsServerGateway) private wsGateway: WsServerGateway
    ) {
    }
    async onModuleInit() {
        // this.wsGateway.server.on('connection', (socket) => {
        //     socket.on('events', (data) => {
        //         console.log('this data: ', data)
        //         this.handleWebSocketEvent(data)
        //     })
        //     socket.on('open', () => {
        //         const port = this.wsGateway.port;
        //         console.log(`server listening ${port}`);
        //     });
        //     socket.on('message', (data: any) => {
        //         console.log(`server messaging`, data);
        //         // this.wsGateway.handleMessage('ARI', data)
        //     });
        // })

        // Подключаемся к ARI
        if (!this.startingStream) {
            await this.connectToARI();
        }
    }

    private handleWebSocketEvent(data: any) {
        this.logger.log('Получено событие от WebSocket', data);
        console.log('Получено событие от WebSocket:', data);
        // Здесь можно обработать события и отправить команды в ARI
    }

    private async connectToARI() {
        console.log('Данные для подключения: ' + `${this.url}` + `${this.username}` + `${this.password}`)
        ariClient.connect(this.url, this.username, this.password)
            .then((ari) => {
                ari.start('voicebot')

                ari.on('StasisStart', (event, incoming) => {
                    if (!this.startingStream) {
                        this.bridge = ari.Bridge();
                        this.bridge.create({type: "mixing"});
                        this.bridge.on('BridgeDestroyed', (event) => {
                            console.log('bridge destored')
                            this.startingStream = false
                            // ari.stop()
                        });
                        // console.log(incoming.id)
                        // console.dir(incoming, { depth: null })
                        this.bridge.addChannel({channel: incoming.id});
                        // incoming.answer((err) => {
                        //     // console.log(JSON.stringify(incoming))
                        //     console.dir(incoming, { depth: null });
                        //     // this.streamAudioFromChannel(incoming)
                        // })
                        this.playback = ari.Playback()
                        incoming.play({media: 'sound:hello-world', lang: 'en'},
                            this.playback,
                            function (err, playback) {
                            console.log(playback)
                        });
                        this.externalChannel = ari.Channel()

                        this.externalChannel.externalMedia({
                            app: 'voicebot',
                            external_host: 'localhost:3032',
                            format: 'alaw',
                        })

                        this.externalChannel.on('StasisStart', (event, chan) => {
                            console.log('ExternalChan: ', chan)
                            this.bridge.addChannel({channel: chan.id});
                        })

                        this.externalChannel.on('StasisEnd', (event, chan) => {
                            console.log('externalMedia Channel stasisEnd')
                        })

                        this.startingStream = true
                        // incoming.hangup()
                    }
                })
                ari.on('StasisEnd', (event, channel) => {
                    console.log('Ended Statis')
                    // this.bridge.removeChannel({channel: channel.id})
                    this.bridge.destroy()
                    this.startingStream = false
                })
            })
            .catch((err) => {
                console.log(err)
            })
    }

    private streamAudioFromChannel(channel) {
        console.log('WebSocket connection established for audio streaming');
        channel.externalMedia({
            app: 'voicebot',
            external_host: '109.226.233.92:3001',
            format: 'alaw',

        })
        console.log('externalMedia Channel: ', channel)
        // this.wsGateway.handleMessage('message', channel.data)
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



