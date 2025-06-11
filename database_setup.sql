-- StreetSmart CV Database Setup
-- Run this in your Supabase SQL editor to create the required tables

-- 1. Create the video_metadata table
CREATE TABLE IF NOT EXISTS video_metadata (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  start_latitude DECIMAL(10, 8),
  start_longitude DECIMAL(11, 8),
  end_latitude DECIMAL(10, 8),
  end_longitude DECIMAL(11, 8),
  recorded_at TIMESTAMPTZ,
  camera_id TEXT NOT NULL,
  upload_user_id UUID NOT NULL REFERENCES auth.users(id),
  duration DECIMAL(10, 2),
  file_size BIGINT NOT NULL,
  raw_metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_video_metadata_user_id ON video_metadata(upload_user_id);
CREATE INDEX IF NOT EXISTS idx_video_metadata_camera_id ON video_metadata(camera_id);
CREATE INDEX IF NOT EXISTS idx_video_metadata_recorded_at ON video_metadata(recorded_at);
CREATE INDEX IF NOT EXISTS idx_video_metadata_file_path ON video_metadata(file_path);
CREATE INDEX IF NOT EXISTS idx_video_metadata_gps ON video_metadata(start_latitude, start_longitude);

-- 3. Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 4. Create trigger for automatic timestamp updates
CREATE TRIGGER update_video_metadata_updated_at 
    BEFORE UPDATE ON video_metadata 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 5. Enable Row Level Security
ALTER TABLE video_metadata ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies

-- Policy: Users can view their own videos
CREATE POLICY "Users can view their own videos" ON video_metadata
  FOR SELECT USING (auth.uid() = upload_user_id);

-- Policy: Users can insert their own videos
CREATE POLICY "Users can insert their own videos" ON video_metadata
  FOR INSERT WITH CHECK (auth.uid() = upload_user_id);

-- Policy: Users can update their own videos
CREATE POLICY "Users can update their own videos" ON video_metadata
  FOR UPDATE USING (auth.uid() = upload_user_id);

-- Policy: Users can delete their own videos
CREATE POLICY "Users can delete their own videos" ON video_metadata
  FOR DELETE USING (auth.uid() = upload_user_id);

-- Policy: Admins can view all videos
CREATE POLICY "Admins can view all videos" ON video_metadata
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.is_admin = true
    )
  );

-- Policy: Admins can update all videos
CREATE POLICY "Admins can update all videos" ON video_metadata
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.is_admin = true
    )
  );

-- 7. Grant necessary permissions
GRANT ALL ON video_metadata TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- 8. Create a view for easier querying (optional)
CREATE OR REPLACE VIEW video_metadata_with_user AS
SELECT 
  vm.*,
  u.email as user_email,
  p.is_admin as user_is_admin
FROM video_metadata vm
LEFT JOIN auth.users u ON vm.upload_user_id = u.id
LEFT JOIN profiles p ON vm.upload_user_id = p.id;

-- 9. Storage bucket policies (run these in Supabase dashboard if needed)
-- Note: These should be configured in the Supabase dashboard under Storage > Policies

/*
-- Storage bucket policy examples:
-- 1. Allow authenticated users to upload to their own folders
-- Policy name: "Allow authenticated users to upload videos"
-- Policy: ((bucket_id = 'videos'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))

-- 2. Allow users to view their own uploaded videos
-- Policy name: "Allow users to view their own videos"  
-- Policy: ((bucket_id = 'videos'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))

-- 3. Allow admins to view all videos
-- Policy name: "Allow admins to view all videos"
-- Policy: ((bucket_id = 'videos'::text) AND (auth.role() = 'authenticated'::text) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))
*/

-- 10. Verify setup
SELECT 'Database setup completed successfully' as status;

-- Setup complete! 
-- Don't forget to:
-- 1. Set up storage bucket policies in the Supabase dashboard
-- 2. Ensure your profiles table has an is_admin boolean column
-- 3. Test the setup with sample data 