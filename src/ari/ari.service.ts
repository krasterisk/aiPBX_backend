import {Inject, Injectable, Logger, OnModuleInit} from '@nestjs/common';
import * as ariClient from 'ari-client';
import {RtpUdpServerService} from "../rtp-udp-server/rtp-udp-server.service";

interface chanVars {
    UNICASTRTP_LOCAL_PORT: number,
    UNICASTRTP_LOCAL_ADDRESS: string
}

@Injectable()
export class AriService implements OnModuleInit {
    private url = process.env.ARI_URL
    private username = process.env.ARI_USER;
    private password = process.env.ARI_PASS;
    private externalHost = process.env.ARI_EXTERNAL_HOST;
    private readonly logger = new Logger();
    private startingStream: boolean
    private bridge: ariClient.Bridge
    private externalChannel: ariClient.Channel
    private playback: ariClient.Playback

    constructor(
        //@Inject(WsServerGateway)
        // private wsGateway: WsServerGateway,
        @Inject(RtpUdpServerService) private rtpUdpServer: RtpUdpServerService
    ) {}

    async onModuleInit() {
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
        console.log('Данные для подключения: ')
        ariClient.connect(this.url, this.username, this.password)
            .then((ari) => {
                ari.start('voicebot')
                console.log('ARI started on ', this.url)
                ari.on('StasisStart', async (event, incoming) => {
                    if (!this.startingStream) {
                        this.bridge = ari.Bridge();
                        await this.bridge.create({type: "mixing"});
                        this.bridge.on('BridgeCreated', (event) => {
                            console.log('bridge created', event)
                            // this.startingStream = false
                            // ari.stop()
                        });
                        this.bridge.on('BridgeDestroyed', (event) => {
                            console.log('bridge destroyed')
                            this.startingStream = false
                            // ari.stop()
                        });
                        // incoming.answer((err) => {
                        //     // console.log(JSON.stringify(incoming))
                        //     console.dir(incoming, { depth: null });
                        //     // this.streamAudioFromChannel(incoming)
                        // })
                        this.playback = ari.Playback()
                        incoming.play({media: 'sound:hello-world', lang: 'ru'},
                            this.playback,
                            function (err, playback) {
                                console.log('playbacking')
                            });
                        await this.bridge.addChannel({channel: incoming.id});
                        // this.rtpUdpServer = new RtpUdpServerService()
                        this.externalChannel = ari.Channel()
                        this.externalChannel.externalMedia({
                            app: 'voicebot',
                            external_host: this.externalHost,
                            format: 'slin16',
                        }).then((channel) => {
                            const channelVars = channel.channelvars as chanVars
                                console.log("externalChannelVars: ", channelVars)
                            this.rtpUdpServer.externalAddress = channelVars.UNICASTRTP_LOCAL_ADDRESS;
                            this.rtpUdpServer.externalPort = channelVars.UNICASTRTP_LOCAL_PORT;
                        }).catch((err) => {
                            console.log('erroring extmedia')
                        })
                        this.externalChannel.on('StasisStart', async (event, chan) => {
                            if (this.bridge) {
                                console.log("Bridge ID: ", this.bridge.id)
                                this.bridge.addChannel({channel: chan.id}, (err) => {
                                    console.log(err)
                                });
                            }
                        })

                        this.externalChannel.on('StasisEnd', (event, chan) => {
                            console.log('externalMedia Channel stasisEnd')
                            // this.bridge.removeChannel({channel: chan.id})
                            // chan.hangup()
                            //this.bridge.destroy()
                        })

                        this.startingStream = true
                    }
                })

                ari.on('StasisEnd', (event, channel) => {
                    console.log('Ended Statis')
                    // this.bridge.removeChannel({channel: channel.id})
                    // channel.hangup()
                    // this.rtpUdpServer.onModuleDestroy()
                    if(this.startingStream) {
                        this.bridge.destroy()
                        this.externalChannel.hangup()
                        this.startingStream = false
                    }
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
            external_host: this.externalHost,
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



