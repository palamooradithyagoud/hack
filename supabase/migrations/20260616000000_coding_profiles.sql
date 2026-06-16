-- Alter profiles table to support coding profile links
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS leetcode_profile TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_profile TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS codeforces_profile TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS codementor_profile TEXT;
