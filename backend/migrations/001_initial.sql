-- Migration: 001_initial
-- Creates the core schema for the Mini Campaign Manager

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent')),
  scheduled_at TIMESTAMP WITH TIME ZONE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipients (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_recipients (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at TIMESTAMP WITH TIME ZONE,
  opened_at TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (campaign_id, recipient_id)
);

-- Indexes

-- Fast lookup of campaigns by creator (campaigns list page)
CREATE INDEX idx_campaigns_created_by ON campaigns(created_by);

-- Filter/sort campaigns by status (common filter on list page)
CREATE INDEX idx_campaigns_status ON campaigns(status);

-- Fast lookup of campaign_recipients by campaign (stats, send operations)
CREATE INDEX idx_campaign_recipients_campaign_id ON campaign_recipients(campaign_id);

-- Fast lookup of campaign_recipients by recipient (recipient history)
CREATE INDEX idx_campaign_recipients_recipient_id ON campaign_recipients(recipient_id);

-- Lookup recipients by email (upsert on campaign creation)
CREATE INDEX idx_recipients_email ON recipients(email);

-- Find scheduled campaigns that need to be sent
CREATE INDEX idx_campaigns_scheduled_at ON campaigns(scheduled_at) WHERE status = 'scheduled';
