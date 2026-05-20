-- Fix foreign key relationships for user_offers and user_wants
-- Run this in your Supabase SQL Editor

-- Drop existing foreign key constraints if they exist
ALTER TABLE public.user_offers 
  DROP CONSTRAINT IF EXISTS user_offers_user_id_fkey;

ALTER TABLE public.user_wants 
  DROP CONSTRAINT IF EXISTS user_wants_user_id_fkey;

-- Add new foreign key constraints pointing to profiles table
ALTER TABLE public.user_offers 
  ADD CONSTRAINT user_offers_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.user_wants 
  ADD CONSTRAINT user_wants_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Refresh the schema cache
NOTIFY pgrst, 'reload schema';
