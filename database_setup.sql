-- StreetSmart CV Database Setup
-- Run this in your Supabase SQL editor to create the required tables

-- 0. Create the profiles table for user management
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid 42710 errors)
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view their own videos" ON video_metadata;
DROP POLICY IF EXISTS "Users can insert their own videos" ON video_metadata;
DROP POLICY IF EXISTS "Users can update their own videos" ON video_metadata;
DROP POLICY IF EXISTS "Users can delete their own videos" ON video_metadata;
DROP POLICY IF EXISTS "Service role can manage all videos" ON video_metadata;
DROP POLICY IF EXISTS "Admins can view all videos" ON video_metadata;
DROP POLICY IF EXISTS "Admins can update all videos" ON video_metadata;
DROP POLICY IF EXISTS "Users can view their own clips" ON video_clips;
DROP POLICY IF EXISTS "Users can insert their own clips" ON video_clips;
DROP POLICY IF EXISTS "Users can update their own clips" ON video_clips;
DROP POLICY IF EXISTS "Users can delete their own clips" ON video_clips;
DROP POLICY IF EXISTS "Service role can manage all clips" ON video_clips;
DROP POLICY IF EXISTS "Admins can view all clips" ON video_clips;
DROP POLICY IF EXISTS "Admins can update all clips" ON video_clips;
DROP POLICY IF EXISTS "Users can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own videos" ON storage.objects;

-- Drop existing triggers if they exist (to avoid 42710 errors)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_video_metadata_updated_at ON video_metadata;
DROP TRIGGER IF EXISTS update_video_clips_updated_at ON video_clips;
DROP TRIGGER IF EXISTS auto_process_video_trigger ON storage.objects;

-- Create policies for profiles
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Create policies for video_metadata
CREATE POLICY "Users can view their own videos" ON video_metadata
  FOR SELECT USING (auth.uid() = upload_user_id);

CREATE POLICY "Users can insert their own videos" ON video_metadata
  FOR INSERT WITH CHECK (auth.uid() = upload_user_id);

CREATE POLICY "Users can update their own videos" ON video_metadata
  FOR UPDATE USING (auth.uid() = upload_user_id);

CREATE POLICY "Users can delete their own videos" ON video_metadata
  FOR DELETE USING (auth.uid() = upload_user_id);

CREATE POLICY "Service role can manage all videos" ON video_metadata
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Admins can view all videos" ON video_metadata
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update all videos" ON video_metadata
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.is_admin = true
    )
  );

-- Create policies for video_clips
CREATE POLICY "Users can view their own clips" ON video_clips
  FOR SELECT USING (auth.uid() = upload_user_id);

CREATE POLICY "Users can insert their own clips" ON video_clips
  FOR INSERT WITH CHECK (auth.uid() = upload_user_id);

CREATE POLICY "Users can update their own clips" ON video_clips
  FOR UPDATE USING (auth.uid() = upload_user_id);

CREATE POLICY "Users can delete their own clips" ON video_clips
  FOR DELETE USING (auth.uid() = upload_user_id);

CREATE POLICY "Service role can manage all clips" ON video_clips
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Admins can view all clips" ON video_clips
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update all clips" ON video_clips
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.is_admin = true
    )
  );

-- Storage policies
CREATE POLICY "Users can upload videos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'videos' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own videos" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'videos' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Create a trigger to automatically create a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger the function every time a user is created
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

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
  processing_status TEXT DEFAULT 'unprocessed' CHECK (processing_status IN ('unprocessed', 'processing', 'completed', 'failed')),
  processing_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create the video_clips table for processed segments
CREATE TABLE IF NOT EXISTS video_clips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID NOT NULL REFERENCES video_metadata(id) ON DELETE CASCADE,
  clip_file_path TEXT NOT NULL,
  clip_index INTEGER NOT NULL,
  duration DECIMAL(10, 2) NOT NULL,
  pothole_detected BOOLEAN DEFAULT FALSE,
  gps_records JSONB DEFAULT '[]'::jsonb,
  upload_user_id UUID NOT NULL REFERENCES auth.users(id),
  ml_analysis_status TEXT DEFAULT 'pending' CHECK (ml_analysis_status IN ('pending', 'processing', 'completed', 'failed')),
  ml_analysis_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(video_id, clip_index)
);

-- 3. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_video_metadata_user_id ON video_metadata(upload_user_id);
CREATE INDEX IF NOT EXISTS idx_video_metadata_camera_id ON video_metadata(camera_id);
CREATE INDEX IF NOT EXISTS idx_video_metadata_recorded_at ON video_metadata(recorded_at);
CREATE INDEX IF NOT EXISTS idx_video_metadata_file_path ON video_metadata(file_path);
CREATE INDEX IF NOT EXISTS idx_video_metadata_gps ON video_metadata(start_latitude, start_longitude);
CREATE INDEX IF NOT EXISTS idx_video_metadata_status ON video_metadata(processing_status);

-- Video clips indexes
CREATE INDEX IF NOT EXISTS idx_video_clips_video_id ON video_clips(video_id);
CREATE INDEX IF NOT EXISTS idx_video_clips_user_id ON video_clips(upload_user_id);
CREATE INDEX IF NOT EXISTS idx_video_clips_pothole ON video_clips(pothole_detected);
CREATE INDEX IF NOT EXISTS idx_video_clips_ml_status ON video_clips(ml_analysis_status);
CREATE INDEX IF NOT EXISTS idx_video_clips_clip_index ON video_clips(video_id, clip_index);

-- 4. Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 5. Create triggers for automatic timestamp updates
CREATE TRIGGER update_video_metadata_updated_at 
    BEFORE UPDATE ON video_metadata 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_clips_updated_at 
    BEFORE UPDATE ON video_clips 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_clips ENABLE ROW LEVEL SECURITY;

-- 7. Grant necessary permissions
GRANT ALL ON video_metadata TO authenticated;
GRANT ALL ON video_clips TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- 10. Create views for easier querying
CREATE OR REPLACE VIEW video_metadata_with_user AS
SELECT 
  vm.*,
  u.email as user_email,
  p.is_admin as user_is_admin,
  COUNT(vc.id) as clips_count,
  COUNT(CASE WHEN vc.pothole_detected = true THEN 1 END) as pothole_clips_count
FROM video_metadata vm
LEFT JOIN auth.users u ON vm.upload_user_id = u.id
LEFT JOIN profiles p ON vm.upload_user_id = p.id
LEFT JOIN video_clips vc ON vm.id = vc.video_id
GROUP BY vm.id, u.email, p.is_admin;

CREATE OR REPLACE VIEW video_clips_with_metadata AS
SELECT 
  vc.*,
  vm.file_name as source_file_name,
  vm.camera_id,
  vm.recorded_at as source_recorded_at,
  u.email as user_email
FROM video_clips vc
JOIN video_metadata vm ON vc.video_id = vm.id
LEFT JOIN auth.users u ON vc.upload_user_id = u.id;

-- 11. Create functions for common operations

-- Function to update video processing status
CREATE OR REPLACE FUNCTION update_video_processing_status(
  p_video_id UUID,
  p_status TEXT,
  p_error TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE video_metadata 
  SET 
    processing_status = p_status,
    processing_error = p_error,
    updated_at = NOW()
  WHERE id = p_video_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get video processing statistics
CREATE OR REPLACE FUNCTION get_user_video_stats(p_user_id UUID)
RETURNS TABLE (
  total_videos BIGINT,
  total_clips BIGINT,
  total_potholes BIGINT,
  processing_videos BIGINT,
  failed_videos BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT vm.id) as total_videos,
    COUNT(vc.id) as total_clips,
    COUNT(CASE WHEN vc.pothole_detected = true THEN 1 END) as total_potholes,
    COUNT(CASE WHEN vm.processing_status = 'processing' THEN 1 END) as processing_videos,
    COUNT(CASE WHEN vm.processing_status = 'failed' THEN 1 END) as failed_videos
  FROM video_metadata vm
  LEFT JOIN video_clips vc ON vm.id = vc.video_id
  WHERE vm.upload_user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Storage bucket policies (configure these in Supabase dashboard)
/*
Bucket: videos

Policy 1: "Allow authenticated users to upload raw videos"
- Policy: ((bucket_id = 'videos'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = 'raw-videos'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text))
- Allowed operation: INSERT

Policy 2: "Allow users to view their own videos and clips"  
- Policy: ((bucket_id = 'videos'::text) AND (auth.role() = 'authenticated'::text) AND (((storage.foldername(name))[1] = 'raw-videos'::text) OR ((storage.foldername(name))[1] = 'processed-clips'::text)) AND ((storage.foldername(name))[2] = (auth.uid())::text))
- Allowed operation: SELECT

Policy 3: "Allow service role to manage all video files"
- Policy: ((bucket_id = 'videos'::text) AND (auth.jwt() ->> 'role'::text = 'service_role'::text))
- Allowed operation: ALL

Policy 4: "Allow admins to view all videos"
- Policy: ((bucket_id = 'videos'::text) AND (auth.role() = 'authenticated'::text) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))
- Allowed operation: SELECT
*/

-- 13. Verify setup
SELECT 'Database setup completed successfully' as status;

-- Setup complete! 
-- Don't forget to:
-- 1. Set up storage bucket policies in the Supabase dashboard as described above
-- 2. Ensure your profiles table has an is_admin boolean column
-- 3. Configure the edge function environment variables (SUPABASE_SERVICE_ROLE_KEY)
-- 4. Install FFmpeg and ExifTool on your edge function environment
-- 5. Test the setup with sample data 

-- Function to trigger video processing when a file is uploaded to storage
CREATE OR REPLACE FUNCTION trigger_video_processing()
RETURNS trigger AS $$
DECLARE
  file_info record;
  video_metadata record;
  payload json;
BEGIN
  -- Only process files in the raw-videos folder
  IF NEW.name LIKE 'raw-videos/%' AND NEW.name LIKE '%.mp4' OR NEW.name LIKE '%.mov' OR NEW.name LIKE '%.avi' THEN
    
    -- Extract user ID from path (raw-videos/{userId}/{filename})
    file_info := (
      SELECT 
        split_part(NEW.name, '/', 2) as user_id,
        split_part(NEW.name, '/', 3) as filename
    );
    
    -- Insert initial video metadata record with processing status
    INSERT INTO video_metadata (
      file_name,
      file_path,
      camera_id,
      upload_user_id,
      file_size,
      processing_status,
      created_at
    ) VALUES (
      file_info.filename,
      NEW.name,
      'garmin_dashcam', -- Default camera type, can be updated later
      file_info.user_id::uuid,
      NEW.metadata->>'size',
      'unprocessed',
      NOW()
    ) RETURNING * INTO video_metadata;
    
    -- Note: We're not automatically triggering processing here
    -- Processing will be triggered manually or by a separate process
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on storage.objects for automatic processing
-- DISABLED: Manual metadata creation is handled in the frontend
-- DROP TRIGGER IF EXISTS auto_process_video_trigger ON storage.objects;
-- CREATE TRIGGER auto_process_video_trigger
--   AFTER INSERT ON storage.objects
--   FOR EACH ROW
--   EXECUTE FUNCTION trigger_video_processing();

-- Add settings for the edge function URL (you'll need to update these)
-- ALTER DATABASE postgres SET app.supabase_url = 'https://your-project-ref.supabase.co';
-- ALTER DATABASE postgres SET app.service_role_key = 'your-service-role-key';

-- Add processing status to video_metadata if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'video_metadata' 
                 AND column_name = 'processing_status') THEN
    ALTER TABLE video_metadata ADD COLUMN processing_status TEXT DEFAULT 'pending';
    ALTER TABLE video_metadata ADD COLUMN processing_error TEXT;
  END IF;
END $$; 