# Fix Storage and Database Issues

## Issues Identified

1. **Storage Bucket Access**: The "videos" bucket is not accessible or doesn't exist
2. **Storage Policies**: The policies were checking the wrong folder position for user ID
3. **Profiles Table**: 406 error when accessing profiles table
4. **Database Schema**: Potential issues with storage.objects table

## Steps to Fix

### 1. Update Database Schema

Run the updated `database_setup.sql` in your Supabase SQL editor. The key changes are:

- Fixed storage policies to check `(storage.foldername(name))[2]` for user ID instead of `[1]`
- Added proper folder structure checks (`raw-videos` and `processed-clips`)
- Added admin policy for storage access

### 2. Create Storage Bucket

In your Supabase dashboard:

1. Go to Storage section
2. Create a new bucket called `videos`
3. Set it to private (not public)
4. The policies in the SQL will handle access control

### 3. Storage Bucket Policies

The updated SQL includes these policies:

```sql
-- Users can upload to raw-videos/{userId}/{filename}
CREATE POLICY "Users can upload videos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'videos' AND 
    (storage.foldername(name))[1] = 'raw-videos' AND
    auth.uid()::text = (storage.foldername(name))[2]
  );

-- Users can view their own videos and clips
CREATE POLICY "Users can view own videos" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'videos' AND 
    ((storage.foldername(name))[1] = 'raw-videos' AND auth.uid()::text = (storage.foldername(name))[2]) OR
    ((storage.foldername(name))[1] = 'processed-clips' AND auth.uid()::text = (storage.foldername(name))[2])
  );

-- Admins can view all videos
CREATE POLICY "Admins can view all videos" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'videos' AND 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.is_admin = true
    )
  );
```

### 4. Test the Fix

1. Run the updated `database_setup.sql`
2. Create the `videos` storage bucket
3. Try uploading a video file
4. Check the browser console for detailed error messages

### 5. Code Changes Made

- **VideoUpload.tsx**: Added storage access check and better error handling
- **VideoList.tsx**: Improved error handling for profiles table access
- **database_setup.sql**: Fixed storage policies and folder structure

### 6. Debugging

The updated code includes console logs to help identify issues:

- Storage access test results
- Upload progress and errors
- User authentication status
- Metadata storage results

Check the browser console for these logs when testing.

## Common Issues

1. **Bucket doesn't exist**: Create the `videos` bucket in Supabase dashboard
2. **Policies not applied**: Run the SQL setup again
3. **Authentication issues**: Check if user is properly logged in
4. **File size limits**: Supabase has default limits, check your plan

## Next Steps

After applying these fixes:

1. Test with a small video file first
2. Check that the `profiles` table has your user record
3. Verify storage bucket permissions
4. Monitor the console for any remaining errors 