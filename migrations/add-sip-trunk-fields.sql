-- Migration: Add sipTechnology to PbxServers, records to SipTrunks
-- Run this on your MySQL database

-- Add sipTechnology column to PbxServers
ALTER TABLE `PbxServers`
    ADD COLUMN IF NOT EXISTS `sipTechnology` VARCHAR(10) NOT NULL DEFAULT 'pjsip'
    AFTER `recordFormat`;

-- Add records column to SipTrunks
ALTER TABLE `SipTrunks`
    ADD COLUMN IF NOT EXISTS `records` TINYINT(1) NOT NULL DEFAULT 0
    AFTER `active`;
