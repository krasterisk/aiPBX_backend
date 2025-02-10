import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'ps_endpoints', timestamps: false })
export class PsEndpoint extends Model<PsEndpoint> {
  @Column({ type: DataType.STRING })
  transport: string;
  @Column({ type: DataType.STRING })
  aors: string;
  @Column({ type: DataType.STRING })
  auth: string;
  @Column({ type: DataType.STRING })
  context: string;
  @Column({ type: DataType.STRING })
  disallow: string;
  @Column({ type: DataType.STRING })
  allow: string;
  @Column({ type: DataType.ENUM('yes', 'no') })
  direct_media: string;
  @Column({ type: DataType.ENUM('invite', 'reinvite', 'update') })
  connected_line_method: string;
  @Column({ type: DataType.ENUM('invite', 'reinvite', 'update') })
  direct_media_method: string;
  @Column({ type: DataType.ENUM('none', 'outgoing', 'incoming') })
  direct_media_glare_mitigation: string;
  @Column({ type: DataType.ENUM('yes', 'no') })
  disable_direct_media_on_nat: string;
  @Column({ type: DataType.ENUM('rfc4733', 'inband', 'info') })
  dtmf_mode: string;
  @Column({ type: DataType.STRING })
  external_media_address: string;
  @Column({ type: DataType.ENUM('yes', 'no') })
  force_rport: string;
  @Column({ type: DataType.ENUM('yes', 'no') })
  ice_support: string;
  @Column({ type: DataType.ENUM('username') })
  identify_by: string;
  @Column({ type: DataType.STRING })
  mailboxes: string;
  @Column({ type: DataType.STRING })
  moh_suggest: string;
  @Column({ type: DataType.STRING })
  outbound_auth: string;
  @Column({ type: DataType.STRING })
  outbound_proxy: string;
  @Column({ type: DataType.ENUM('yes', 'no') })
  rewrite_contact: string;
  @Column({ type: DataType.ENUM('yes', 'no') })
  rtp_ipv6: string;
  @Column({ type: DataType.ENUM('yes', 'no') })
  rtp_symmetric: string;
  @Column({ type: DataType.ENUM('yes', 'no') })
  send_diversion: string;
  @Column({ type: DataType.ENUM('yes', 'no') })
  send_pai: string;
  @Column({ type: DataType.ENUM('yes', 'no') })
  send_rpid: string;
  @Column({ type: DataType.INTEGER })
  timers_min_se: number;

  @Column({ type: DataType.ENUM('forced', 'no', 'required', 'yes') })
  timers: string;

  @Column({ type: DataType.INTEGER })
  timers_sess_expires: number;

  @Column({ type: DataType.STRING })
  callerid: string;

  @Column({ type: DataType.ENUM('allowed_not_screened', 'allowed_passed_screened', 'allowed_failed_screened', 'allowed', 'prohib_not_screened', 'prohib_passed_screened', 'prohib_failed_screened', 'prohib', 'unavailable') })
  callerid_privacy: string;

  @Column({ type: DataType.STRING })
  callerid_tag: string;

  @Column({ type: DataType.ENUM('no', 'required', 'yes') })
  '100rel': string;

  @Column({ type: DataType.ENUM('yes', 'no') })
  aggregate_mwi: string;

  @Column({ type: DataType.ENUM('yes', 'no') })
  trust_id_inbound: string;

  @Column({ type: DataType.ENUM('yes', 'no') })
  trust_id_outbound: string;

  @Column({ type: DataType.ENUM('yes', 'no') })
  use_ptime: string;

  @Column({ type: DataType.ENUM('yes', 'no') })
  use_avpf: string;

  @Column({ type: DataType.ENUM('no', 'sdes', 'dtls') })
  media_encryption: string;

  @Column({ type: DataType.ENUM('yes', 'no') })
  inband_progress: string;

  @Column({ type: DataType.STRING })
  call_group: string;

  @Column({ type: DataType.STRING })
  pickup_group: string;

  @Column({ type: DataType.STRING })
  named_call_group: string;

  @Column({ type: DataType.STRING })
  named_pickup_group: string;

  @Column({ type: DataType.INTEGER })
  device_state_busy_at: number;

  @Column({ type: DataType.ENUM('yes', 'no') })
  fax_detect: string;

  @Column({ type: DataType.ENUM('yes', 'no') })
  t38_udptl: string;

  @Column({ type: DataType.ENUM('none', 'fec', 'redundancy') })
  t38_udptl_ec: string;

  @Column({ type: DataType.INTEGER })
  t38_udptl_maxdatagram: number;

  @Column({ type: DataType.ENUM('yes', 'no') })
  t38_udptl_nat: string;

  @Column({ type: DataType.ENUM('yes', 'no') })
  t38_udptl_ipv6: string;

  @Column({ type: DataType.STRING })
  tone_zone: string;

  @Column({ type: DataType.STRING })
  language: string;

  @Column({ type: DataType.ENUM('yes', 'no') })
  one_touch_recording: string;

  @Column({ type: DataType.STRING })
  record_on_feature: string;

  @Column({ type: DataType.STRING })
  record_off_feature: string;

  @Column({ type: DataType.STRING })
  rtp_engine: string;

  @Column({ type: DataType.ENUM('yes', 'no') })
  allow_transfer: string;

  @Column({ type: DataType.ENUM('yes', 'no') })
  allow_subscribe: string;

  @Column({ type: DataType.STRING })
  sdp_owner: string;

  @Column({ type: DataType.STRING })
  sdp_session: string;

  @Column({ type: DataType.INTEGER })
  tos_audio: number;

  @Column({ type: DataType.INTEGER })
  tos_video: number;

  @Column({ type: DataType.INTEGER })
  cos_audio: number;

  @Column({ type: DataType.INTEGER })
  cos_video: number;

  @Column({ type: DataType.INTEGER })
  sub_min_expiry: number;

  @Column({ type: DataType.STRING })
  from_domain: string;

  @Column({ type: DataType.STRING })
  from_user: string;

  @Column({ type: DataType.STRING })
  mwi_fromuser: string;

  @Column({ type: DataType.STRING })
  dtls_verify: string;

  @Column({ type: DataType.STRING })
  dtls_rekey: string;

  @Column({ type: DataType.STRING })
  dtls_cert_file: string;

  @Column({ type: DataType.STRING })
  dtls_private_key: string;

  @Column({ type: DataType.STRING })
  dtls_cipher: string;

  @Column({ type: DataType.STRING })
  dtls_ca_file: string;

  @Column({ type: DataType.STRING })
  dtls_ca_path: string;

  @Column({ type: DataType.ENUM('active', 'passive', 'actpass') })
  dtls_setup: string;

  @Column({ type: DataType.ENUM('yes', 'no') })
  srtp_tag_32: string;
}
