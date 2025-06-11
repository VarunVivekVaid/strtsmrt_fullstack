# StreetSmart CV - Video Processing & Metadata Storage

This implementation adds comprehensive video metadata processing and storage capabilities to the StreetSmart CV application, specifically designed for dash cam footage analysis.

## Features

### 🎥 Video Processing
- **Camera Type Selection**: Support for different camera types (currently Garmin dash cams)
- **Metadata Extraction**: Extracts GPS coordinates, timestamps, duration, and file information
- **GPS Track Processing**: Processes GPS data to determine start/end coordinates
- **File Validation**: Ensures uploaded files are valid video formats

### 🗄️ Database Storage
- **Structured Metadata**: Stores extracted metadata in organized database tables
- **Raw Metadata Storage**: Preserves original metadata in JSONB format
- **User Association**: Links videos to uploading users with proper permissions
- **Admin Access**: Special admin views for managing all videos

### 🔐 Security
- **Row Level Security**: Users can only access their own videos
- **Admin Permissions**: Admins can view and manage all videos
- **Secure Upload**: Files stored in user-specific folders

## Setup Instructions

### 1. Database Setup

1. **Run the database setup script** in your Supabase SQL editor:
   ```sql
   -- Copy and run the contents of database_setup.sql
   ```

2. **Ensure the profiles table exists** with admin functionality:
   ```sql
   -- If you don't have a profiles table yet:
   CREATE TABLE profiles (
     id UUID REFERENCES auth.users(id) PRIMARY KEY,
     email TEXT,
     is_admin BOOLEAN DEFAULT FALSE,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

3. **Set up storage bucket policies** in the Supabase dashboard:
   - Go to Storage > videos bucket > Policies
   - Add the policies mentioned in `database_setup.sql`

### 2. Environment Variables

Ensure your `.env.local` file has:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Install and Run

```bash
npm install
npm run dev
```

## Usage Guide

### For Regular Users

1. **Sign in** to your account
2. **Select your camera type** (currently Garmin Dash Cam)
3. **Choose a video file** (MP4, MOV, AVI formats supported)
4. **Upload** - the system will automatically:
   - Extract video metadata
   - Process GPS data (if available)
   - Store structured data in the database
   - Save the video file to storage

### For Admin Users

1. **Access Video Management** tab (appears if you have admin privileges)
2. **View all uploaded videos** with metadata
3. **See GPS coordinates** and video details in table format
4. **Monitor storage** vs database discrepancies

## Technical Implementation

### File Structure

```
src/
├── types/video.ts              # TypeScript interfaces for video data
├── services/
│   ├── videoMetadataProcessor.ts  # Core metadata processing logic
│   └── videoDatabase.ts        # Database operations
├── components/
│   ├── VideoUpload.tsx         # Enhanced upload component with camera selection
│   └── VideoList.tsx           # Admin view for video management
└── App.tsx                     # Updated app with navigation
```

### Key Components

#### `VideoMetadataProcessor`
- Extracts basic file metadata using File API
- Processes video duration using HTML5 video element
- Simulates GPS extraction for Garmin files (placeholder for real implementation)
- Validates file types and camera compatibility

#### `VideoDatabase`
- Handles all database operations for video metadata
- Implements proper error handling and type safety
- Supports both user-specific and admin queries

#### Enhanced `VideoUpload`
- Camera type selection with validation
- Real-time file validation
- Progress tracking for upload and processing
- User-friendly error and success messages

#### Enhanced `VideoList`
- Comprehensive metadata display
- GPS coordinate visualization
- Admin-only access controls
- Statistics and summary views

## Database Schema

### `video_metadata` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `file_name` | TEXT | Original filename |
| `file_path` | TEXT | Storage path |
| `start_latitude` | DECIMAL(10,8) | GPS start latitude |
| `start_longitude` | DECIMAL(11,8) | GPS start longitude |
| `end_latitude` | DECIMAL(10,8) | GPS end latitude |
| `end_longitude` | DECIMAL(11,8) | GPS end longitude |
| `recorded_at` | TIMESTAMPTZ | When video was recorded |
| `camera_id` | TEXT | Camera type identifier |
| `upload_user_id` | UUID | User who uploaded |
| `duration` | DECIMAL(10,2) | Video duration in seconds |
| `file_size` | BIGINT | File size in bytes |
| `raw_metadata` | JSONB | Raw metadata from file |
| `created_at` | TIMESTAMPTZ | When record was created |
| `updated_at` | TIMESTAMPTZ | When record was last updated |

## Current Limitations & Future Enhancements

### Current Limitations

1. **GPS Extraction**: Currently simulated - needs server-side implementation
2. **Client-side Processing**: Limited to File API capabilities
3. **Camera Support**: Only Garmin cameras fully implemented

### Planned Enhancements

1. **Server-side Processing**:
   - Implement ExifTool/FFmpeg integration
   - Real GPS data extraction from video metadata
   - Advanced video analysis capabilities

2. **Enhanced GPS Processing**:
   - Route visualization
   - Speed analysis
   - Geographic data enrichment

3. **Additional Camera Support**:
   - BlackVue dash cams
   - Nextbase cameras
   - Generic action cameras

4. **AI Integration**:
   - Pothole detection processing
   - Road condition analysis
   - Automated incident detection

## Troubleshooting

### Common Issues

1. **Database permissions error**:
   - Ensure RLS policies are correctly set up
   - Verify user has appropriate profile record

2. **File upload fails**:
   - Check storage bucket policies
   - Verify file size limits
   - Ensure proper authentication

3. **Metadata not appearing**:
   - Check database table exists
   - Verify user permissions
   - Look for JavaScript console errors

### Debug Tips

1. **Check browser console** for detailed error messages
2. **Verify Supabase logs** in the dashboard
3. **Ensure admin flag** is set correctly in profiles table

## API Reference

### Key Functions

```typescript
// Process video file and extract metadata
VideoMetadataProcessor.processVideoFile(file: File, cameraId: string, userId: string)

// Store metadata in database
VideoDatabase.storeVideoMetadata(metadata: VideoMetadata)

// Retrieve user's videos
VideoDatabase.getUserVideoMetadata(userId: string)

// Admin: Get all videos
VideoDatabase.getAllVideoMetadata()
```

## Contributing

When extending this system:

1. **Follow the established patterns** for type safety
2. **Add proper error handling** for all operations
3. **Ensure proper testing** before committing
4. **Update documentation** for new features
5. **Consider security implications** of new functionality

---

**Note**: This implementation provides the foundation for video metadata processing. For production use, implement server-side processing for accurate GPS extraction and enhanced security. 