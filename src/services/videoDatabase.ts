import { supabase } from '../config/supabaseClient'
import type { VideoMetadata } from '../types/video'

export class VideoDatabase {
  /**
   * Creates the video_metadata table if it doesn't exist
   * Note: In production, this should be done via Supabase migrations
   */
  static async initializeDatabase() {
    // This is just for reference - actual table creation should be done in Supabase dashboard
    const createTableSQL = `
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
      
      -- Create indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_video_metadata_user_id ON video_metadata(upload_user_id);
      CREATE INDEX IF NOT EXISTS idx_video_metadata_camera_id ON video_metadata(camera_id);
      CREATE INDEX IF NOT EXISTS idx_video_metadata_recorded_at ON video_metadata(recorded_at);
      CREATE INDEX IF NOT EXISTS idx_video_metadata_status ON video_metadata(processing_status);
      
      -- Enable RLS
      ALTER TABLE video_metadata ENABLE ROW LEVEL SECURITY;
      
      -- Create policies
      CREATE POLICY "Users can view their own videos" ON video_metadata
        FOR SELECT USING (auth.uid() = upload_user_id);
      
      CREATE POLICY "Users can insert their own videos" ON video_metadata
        FOR INSERT WITH CHECK (auth.uid() = upload_user_id);
      
      CREATE POLICY "Users can update their own videos" ON video_metadata
        FOR UPDATE USING (auth.uid() = upload_user_id);
      
      CREATE POLICY "Admins can view all videos" ON video_metadata
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.is_admin = true
          )
        );
    `
    
    console.log('Database schema for reference:', createTableSQL)
  }
  
  /**
   * Stores video metadata in the database
   */
  static async storeVideoMetadata(metadata: VideoMetadata): Promise<VideoMetadata> {
    try {
      const { data, error } = await supabase
        .from('video_metadata')
        .insert([{
          file_name: metadata.file_name,
          file_path: metadata.file_path,
          start_latitude: metadata.start_latitude,
          start_longitude: metadata.start_longitude,
          end_latitude: metadata.end_latitude,
          end_longitude: metadata.end_longitude,
          recorded_at: metadata.recorded_at,
          camera_id: metadata.camera_id,
          upload_user_id: metadata.upload_user_id,
          duration: metadata.duration,
          file_size: metadata.file_size,
          raw_metadata: metadata.raw_metadata,
          processing_status: metadata.processing_status || 'unprocessed',
          processing_error: metadata.processing_error
        }])
        .select()
        .single()
      
      if (error) throw error
      
      return data as VideoMetadata
    } catch (error) {
      console.error('Error storing video metadata:', error)
      throw new Error(`Failed to store video metadata: ${error}`)
    }
  }
  
  /**
   * Retrieves video metadata for a specific user
   */
  static async getUserVideoMetadata(userId: string): Promise<VideoMetadata[]> {
    try {
      const { data, error } = await supabase
        .from('video_metadata')
        .select('*')
        .eq('upload_user_id', userId)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      
      return data as VideoMetadata[]
    } catch (error) {
      console.error('Error fetching user video metadata:', error)
      throw new Error(`Failed to fetch video metadata: ${error}`)
    }
  }
  
  /**
   * Retrieves all video metadata (admin only)
   */
  static async getAllVideoMetadata(): Promise<VideoMetadata[]> {
    try {
      const { data, error } = await supabase
        .from('video_metadata')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      
      return data as VideoMetadata[]
    } catch (error) {
      console.error('Error fetching all video metadata:', error)
      throw new Error(`Failed to fetch all video metadata: ${error}`)
    }
  }
  
  /**
   * Updates video metadata
   */
  static async updateVideoMetadata(id: string, updates: Partial<VideoMetadata>): Promise<VideoMetadata> {
    try {
      const { data, error } = await supabase
        .from('video_metadata')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      
      return data as VideoMetadata
    } catch (error) {
      console.error('Error updating video metadata:', error)
      throw new Error(`Failed to update video metadata: ${error}`)
    }
  }
  
  /**
   * Deletes video metadata
   */
  static async deleteVideoMetadata(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('video_metadata')
        .delete()
        .eq('id', id)
      
      if (error) throw error
    } catch (error) {
      console.error('Error deleting video metadata:', error)
      throw new Error(`Failed to delete video metadata: ${error}`)
    }
  }
  
  /**
   * Gets video metadata by file path
   */
  static async getVideoMetadataByPath(filePath: string): Promise<VideoMetadata | null> {
    try {
      const { data, error } = await supabase
        .from('video_metadata')
        .select('*')
        .eq('file_path', filePath)
        .single()
      
      if (error) {
        if (error.code === 'PGRST116') return null // No rows found
        throw error
      }
      
      return data as VideoMetadata
    } catch (error) {
      console.error('Error fetching video metadata by path:', error)
      throw new Error(`Failed to fetch video metadata: ${error}`)
    }
  }

  /**
   * Updates the processing status of a video
   */
  static async updateProcessingStatus(id: string, status: 'unprocessed' | 'processing' | 'completed' | 'failed', error?: string): Promise<VideoMetadata> {
    try {
      const { data, error: updateError } = await supabase
        .from('video_metadata')
        .update({
          processing_status: status,
          processing_error: error,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()
      
      if (updateError) throw updateError
      
      return data as VideoMetadata
    } catch (error) {
      console.error('Error updating processing status:', error)
      throw new Error(`Failed to update processing status: ${error}`)
    }
  }
} 