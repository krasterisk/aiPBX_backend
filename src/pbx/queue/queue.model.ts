import {Column, DataType, Model, Table} from "sequelize-typescript";
import {ApiProperty} from "@nestjs/swagger";

export enum QueueStrategies {
    ringall = 'ringall',
    leastrecent = 'leastrecent',
    fewestcalls = 'fewestcalls',
    random = 'random',
    rrmemory = 'rrmemory',
    linear = 'linear',
    wrandom = 'wrandom',
    rrordered = 'rrordered'
}

interface CreateQueueAttr {
    name: string
    strategy: QueueStrategies
    vpbx_user_id: number
}

@Table({tableName: "pbx_queues", createdAt: false, updatedAt: false})
export class Queue extends Model<Queue, CreateQueueAttr> {
    @ApiProperty({example: 'Ops', description: "Queue name"})
    @Column({type: DataType.STRING, allowNull: false, unique: true, primaryKey: true})
    name: string
    @ApiProperty({example: 'Call-center', description: "Queue description"})
    @Column({type: DataType.STRING, allowNull: true})
    description: string
    @ApiProperty({example: 'Ops', description: "Moh class"})
    @Column({type: DataType.STRING, allowNull: true})
    musiconhold: string
    @ApiProperty({example: 'test.wav', description: "Prompt for operator"})
    @Column({type: DataType.STRING, allowNull: true})
    announce: string
    @ApiProperty({example: 'sip-out', description: "Context for dial into queue"})
    @Column({type: DataType.STRING, allowNull: true})
    context: string
    @ApiProperty({example: '25', description: "Queue timout"})
    @Column({type: DataType.INTEGER, allowNull: true})
    timeout: number
    @ApiProperty({example: 'yes', description: "Ring in use. Default yes"})
    @Column({type: DataType.BOOLEAN, allowNull: true})
    ringinuse: boolean
    @ApiProperty({example: 'yes', description: "Set var interface. Default yes"})
    @Column({type: DataType.BOOLEAN, allowNull: true})
    setinterfacevar: boolean
    @ApiProperty({example: 'yes', description: "Set queue var. Default yes"})
    @Column({type: DataType.BOOLEAN, allowNull: true})
    setqueuevar: boolean
    @ApiProperty({example: 'yes', description: "Set queue entry var. Default yes"})
    @Column({type: DataType.BOOLEAN, allowNull: true})
    setqueueentryvar: boolean
//    @ApiProperty({example: 'sip-out', description: "Context for dial into queue"})
    @Column({type: DataType.STRING, allowNull: true})
    monitor_form: string
//    @ApiProperty({example: 'sip-out', description: "Context for dial into queue"})
    @Column({type: DataType.STRING, allowNull: true})
    membermacro: string
//    @ApiProperty({example: 'sip-out', description: "Context for dial into queue"})
    @Column({type: DataType.STRING, allowNull: true})
    membergosub: string
//    @ApiProperty({example: 'sip-out', description: "Context for dial into queue"})
    @Column({type: DataType.STRING, allowNull: true})
    queue_youarenext: string
//    @ApiProperty({example: 'sip-out', description: "Context for dial into queue"})
    @Column({type: DataType.STRING, allowNull: true})
    queue_thereare: string
//    @ApiProperty({example: 'sip-out', description: "Context for dial into queue"})
    @Column({type: DataType.STRING, allowNull: true})
    queue_callswaiting: string
//    @ApiProperty({example: 'sip-out', description: "Context for dial into queue"})
    @Column({type: DataType.STRING, allowNull: true})
    queue_quantity1: string
//    @ApiProperty({example: 'sip-out', description: "Context for dial into queue"})
    @Column({type: DataType.STRING, allowNull: true})
    queue_quantity2: string
//    @ApiProperty({example: 'sip-out', description: "Context for dial into queue"})
    @Column({type: DataType.STRING, allowNull: true})
    queue_holdtime: string
//    @ApiProperty({example: 'sip-out', description: "Context for dial into queue"})
    @Column({type: DataType.STRING, allowNull: true})
    queue_minutes: string
//    @ApiProperty({example: 'sip-out', description: "Context for dial into queue"})
    @Column({type: DataType.STRING, allowNull: true})
    queue_minute: string
//    @ApiProperty({example: 'sip-out', description: "Context for dial into queue"})
    @Column({type: DataType.STRING, allowNull: true})
    queue_seconds: string
//    @ApiProperty({example: 'sip-out', description: "Context for dial into queue"})
    @Column({type: DataType.STRING, allowNull: true})
    queue_thankyou: string
//    @ApiProperty({example: 'sip-out', description: "Context for dial into queue"})
    @Column({type: DataType.STRING, allowNull: true})
    queue_callerannounce: string
//    @ApiProperty({example: 'sip-out', description: "Context for dial into queue"})
    @Column({type: DataType.STRING, allowNull: true})
    queue_reporthold: string
//    @ApiProperty({example: 'sip-out', description: "Context for dial into queue"})
    @Column({type: DataType.INTEGER, allowNull: true})
    announce_frequency: number
    @ApiProperty({example: 'no', description: "Announce to first user. Default no"})
    @Column({type: DataType.BOOLEAN, allowNull: true})
    announce_to_first_user: boolean
    @ApiProperty({example: '20', description: "Minimal announce frequency. Default 0"})
    @Column({type: DataType.INTEGER, allowNull: true})
    min_announce_frequency: number
    @ApiProperty({example: '1', description: "Round seconds. Default 0"})
    @Column({type: DataType.INTEGER, allowNull: true})
    announce_round_seconds: number
    @ApiProperty({example: '1', description: "Announce holdtime. Default 0"})
    @Column({type: DataType.STRING, allowNull: true})
    announce_holdtime: string
    @ApiProperty({example: 'yes', description: "Announce position. Default no"})
    @Column({type: DataType.BOOLEAN, allowNull: true})
    announce_position: boolean
    @ApiProperty({example: '5', description: "Announce position limit. Default 0"})
    @Column({type: DataType.INTEGER, allowNull: true})
    announce_position_limit: number
    @ApiProperty({example: 'filename1.wav,filename2.wav', description: "Prompts for periodic announce"})
    @Column({type: DataType.STRING, allowNull: true})
    periodic_announce: string
    @ApiProperty({example: '60', description: "Periodic announce frequency"})
    @Column({type: DataType.INTEGER, allowNull: true})
    periodic_announce_frequency: number
    @ApiProperty({example: 'no', description: "Relative periodic announce. Default no"})
    @Column({type: DataType.ENUM('yes', 'no'), allowNull: true})
    relative_periodic_announce: 'yes' | 'no'
    @ApiProperty({example: 'no', description: "Random periodic announce. Default no"})
    @Column({type: DataType.ENUM('yes', 'no'), allowNull: true})
    random_periodic_announce: 'yes' | 'no'
    @ApiProperty({example: '10', description: "Query retry ringing. Default 0"})
    @Column({type: DataType.INTEGER, allowNull: true})
    retry: number
    @ApiProperty({example: '10', description: "Query wraptime. Default 0"})
    @Column({type: DataType.INTEGER, allowNull: true})
    wrapuptime: number
    @ApiProperty({example: '10', description: "Penalty member limit. Default 0"})
    @Column({type: DataType.INTEGER, allowNull: true})
    penaltymemberslimit: number
    @ApiProperty({example: 'yes', description: "Autofill. Default yes"})
    @Column({type: DataType.ENUM('yes', 'no'), allowNull: true})
    autofill: 'yes' | 'no'
//    @ApiProperty({example: '1', description: "Monitor type. Default 0"})
    @Column({type: DataType.STRING, allowNull: true})
    monitor_type: string
    @ApiProperty({example: 'yes', description: "Autopause. Default yes"})
    @Column({type: DataType.ENUM('yes', 'no', 'all'), allowNull: true})
    autopause: 'yes' | 'no' | 'all'
    @ApiProperty({example: '20', description: "Autopause delay. Default 0"})
    @Column({type: DataType.INTEGER, allowNull: true})
    autopausedelay: number
    @ApiProperty({example: 'no', description: "Autopause busy. Default no"})
    @Column({type: DataType.ENUM('yes', 'no'), allowNull: true})
    autopausebusy: 'yes' | 'no'
    @ApiProperty({example: 'no', description: "Autopause unavailable. Default no"})
    @Column({type: DataType.ENUM('yes', 'no'), allowNull: true})
    autopauseunavail: 'yes' | 'no'
    @ApiProperty({example: '20', description: "Maximum queue volume. Default 0"})
    @Column({type: DataType.INTEGER, allowNull: true})
    maxlen: number
    @ApiProperty({example: '20', description: "Queue service level. Default 0"})
    @Column({type: DataType.INTEGER, allowNull: true})
    servicelevel: number
    @ApiProperty({example: 'ringall', description: "Queue strategy. Default ringall"})
    @Column({type: DataType.ENUM(Object.values(QueueStrategies).join(',')), allowNull: true})
    strategy: QueueStrategies
    @ApiProperty({example: 'no', description: "Join empty queue. Default yes"})
    @Column({type: DataType.STRING, allowNull: true})
    joinempty: string
    @ApiProperty({example: 'no', description: "Leave queue when empty. Default no"})
    @Column({type: DataType.STRING, allowNull: true})
    leavewhenempty: string
    @ApiProperty({example: 'no', description: "Report holdtime to member. Default no"})
    @Column({type: DataType.ENUM('yes', 'no'), allowNull: true})
    reportholdtime: 'yes' | 'no'
    @ApiProperty({example: '10', description: "Member ring delay. Default 0"})
    @Column({type: DataType.INTEGER, allowNull: true})
    memberdelay: number
    @ApiProperty({example: '2', description: "Queue weight. Default 0"})
    @Column({type: DataType.INTEGER, allowNull: true})
    weight: number
    @ApiProperty({example: 'no', description: "Timeout restart. Default no"})
    @Column({type: DataType.ENUM('yes', 'no'), allowNull: true})
    timeoutrestart: 'yes' | 'no'
//    @ApiProperty({example: 'no', description: "Default queue rule. Default no"})
    @Column({type: DataType.STRING, allowNull: true})
    defaultrule: string
//    @ApiProperty({example: 'no', description: "Timeout priority. Default no"})
    @Column({type: DataType.STRING, allowNull: true})
    timeoutpriority: string
//    @ApiProperty({example: '2', description: "Queue weight. Default 0"})
    @Column({type: DataType.INTEGER, allowNull: true})
    vpbx_user_id: number
}
