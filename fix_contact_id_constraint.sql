-- Fix: Make contact_id nullable in tasks table
-- This allows tasks to be created without a contact_id

-- Remove NOT NULL constraint from contact_id column
ALTER TABLE tasks 
ALTER COLUMN contact_id DROP NOT NULL;

-- Add a comment explaining the column
COMMENT ON COLUMN tasks.contact_id IS 'Optional reference to a contact. Tasks can exist without a contact.';
