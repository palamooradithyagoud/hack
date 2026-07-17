-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE dsa_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_progress ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can view their own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Resume Analysis Policies
CREATE POLICY "Users can view their own resume analysis"
    ON resume_analysis FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own resume analysis"
    ON resume_analysis FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own resume analysis"
    ON resume_analysis FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own resume analysis"
    ON resume_analysis FOR UPDATE
    USING (auth.uid() = user_id);

-- DSA Progress Policies
CREATE POLICY "Users can view their own DSA progress"
    ON dsa_progress FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own DSA progress"
    ON dsa_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own DSA progress"
    ON dsa_progress FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own DSA progress"
    ON dsa_progress FOR DELETE
    USING (auth.uid() = user_id);

-- Interview Progress Policies
CREATE POLICY "Users can view their own interview progress"
    ON interview_progress FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own interview progress"
    ON interview_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own interview progress"
    ON interview_progress FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own interview progress"
    ON interview_progress FOR DELETE
    USING (auth.uid() = user_id);
 