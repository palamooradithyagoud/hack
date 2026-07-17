-- 1. profiles table (MVP First)
CREATE TABLE profiles (
    id UUID PRIMARY KEY, -- Future-linked to auth.users.id
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    target_role TEXT,
    skill_level TEXT,
    preferred_learning_path TEXT,
    target_companies TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for frequent email lookups (e.g., auth syncing)
CREATE INDEX idx_profiles_email ON profiles(email);

-- 2. resume_analysis table
CREATE TABLE resume_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    resume_file_url TEXT NOT NULL,
    ats_score INTEGER CHECK (ats_score >= 0 AND ats_score <= 100),
    ai_feedback JSONB,
    improvement_suggestions JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for fetching a user's resume history sorted by latest
CREATE INDEX idx_resume_analysis_user_created ON resume_analysis(user_id, created_at DESC);

-- 3. dsa_progress table
CREATE TABLE dsa_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    total_solved INTEGER DEFAULT 0,
    easy_solved INTEGER DEFAULT 0,
    medium_solved INTEGER DEFAULT 0,
    hard_solved INTEGER DEFAULT 0,
    weak_topics TEXT[],
    daily_streak INTEGER DEFAULT 0,
    last_active_date DATE DEFAULT CURRENT_DATE
);

-- Index for fetching a user's DSA stats for dashboard analytics
CREATE INDEX idx_dsa_progress_user ON dsa_progress(user_id);

-- 4. interview_progress table
CREATE TABLE interview_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    target_company TEXT NOT NULL,
    mock_interview_score INTEGER CHECK (mock_interview_score >= 0 AND mock_interview_score <= 100),
    weak_areas TEXT[],
    interview_round_type TEXT,
    preparation_status TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for quick lookups of a user's prep per company
CREATE INDEX idx_interview_progress_user_company ON interview_progress(user_id, target_company);

-- Set up automatic updated_at timestamp trigger for interview_progress
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_interview_progress_modtime
BEFORE UPDATE ON interview_progress
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
 