import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ProcessVideoRequest {
  filePath: string
  userId: string
  cameraId: string
  originalFileName: string
  fileSize: number
}

interface GPSRecord {
  timestamp: string
  latitude: number
  longitude: number
}

interface ClipData {
  source_file: string
  clip_file: string
  clip_index: number
  duration: number
  pothole: boolean
  gps_data: GPSRecord[]
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // Use service role for admin operations
    )

    // Parse request body
    const { filePath, userId, cameraId, originalFileName, fileSize }: ProcessVideoRequest = await req.json()

    if (!filePath || !userId || !cameraId) {
      throw new Error('Missing required parameters')
    }

    console.log(`Processing video: ${filePath} for user: ${userId}`)

    // Step 1: Download the raw video from storage
    const { data: fileData, error: downloadError } = await supabaseClient.storage
      .from('videos')
      .download(filePath)

    if (downloadError) throw new Error(`Failed to download file: ${downloadError.message}`)

    // Step 2: Save file temporarily for processing
    const tempInputPath = `/tmp/input_${Date.now()}.mp4`
    await Deno.writeFile(tempInputPath, new Uint8Array(await fileData.arrayBuffer()))

    // Step 3: Extract metadata using FFprobe
    const metadataResult = await runCommand([
      'ffprobe', '-v', 'error', '-print_format', 'json', 
      '-show_format', '-show_streams', tempInputPath
    ])
    const metadata = JSON.parse(metadataResult.stdout)

    // Step 4: Extract GPS data if it's a Garmin camera
    let gpsData: GPSRecord[] = []
    if (cameraId === 'garmin_dashcam') {
      try {
        const gpsResult = await runCommand(['exiftool', '-ee', '-b', tempInputPath])
        gpsData = parseGpsData(gpsResult.stdout)
        console.log(`Extracted ${gpsData.length} GPS records`)
      } catch (error) {
        console.warn('GPS extraction failed:', error)
      }
    }

    // Step 5: Get video start time
    const videoStartTime = getVideoStartTime(metadata, gpsData)
    
    // Step 6: Segment video into 10-second clips
    const segmentLength = 10
    const outputDir = `/tmp/clips_${Date.now()}`
    await Deno.mkdir(outputDir, { recursive: true })
    
    const baseName = originalFileName.replace(/\.[^/.]+$/, '')
    const outputPattern = `${outputDir}/${baseName}_clip_%03d.mp4`
    
    await runCommand([
      'ffmpeg', '-i', tempInputPath,
      '-c', 'copy', '-map_metadata', '0',
      '-f', 'segment', '-segment_time', segmentLength.toString(),
      '-reset_timestamps', '1',
      outputPattern
    ])

    // Step 7: Process generated clips
    const clipsData: ClipData[] = []
    const clipFiles = []
    
    try {
      for await (const dirEntry of Deno.readDir(outputDir)) {
        if (dirEntry.name.endsWith('.mp4') && dirEntry.name.includes('_clip_')) {
          clipFiles.push(dirEntry.name)
        }
      }
    } catch (error) {
      console.warn('Error reading clips directory:', error)
    }

    clipFiles.sort()

    for (let i = 0; i < clipFiles.length; i++) {
      const clipFile = clipFiles[i]
      const fullClipPath = `${outputDir}/${clipFile}`
      
      // Get clip duration
      const durationResult = await runCommand([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        fullClipPath
      ])
      
      const duration = parseFloat(durationResult.stdout.trim())
      
      // Only keep clips that are approximately the target length
      if (Math.abs(duration - segmentLength) < 0.1) {
        // Associate GPS data with this clip
        const clipStartTime = new Date(videoStartTime.getTime() + (i * segmentLength * 1000))
        const clipEndTime = new Date(clipStartTime.getTime() + (segmentLength * 1000))
        
        const clipGpsData = gpsData.filter(record => {
          const recordTime = new Date(record.timestamp)
          return recordTime >= clipStartTime && recordTime < clipEndTime
        })

        // Upload clip to storage
        const clipData = await Deno.readFile(fullClipPath)
        const clipStoragePath = `processed-clips/${userId}/${clipFile}`
        
        const { error: clipUploadError } = await supabaseClient.storage
          .from('videos')
          .upload(clipStoragePath, clipData)

        if (clipUploadError) {
          console.error(`Failed to upload clip ${clipFile}:`, clipUploadError)
          continue
        }

        clipsData.push({
          source_file: filePath,
          clip_file: clipStoragePath,
          clip_index: i,
          duration: duration,
          pothole: false, // Default value, can be updated later by ML models
          gps_data: clipGpsData
        })
      }
    }

    // Step 8: Store video metadata and clips in database
    const videoMetadata = {
      file_name: originalFileName,
      file_path: filePath,
      camera_id: cameraId,
      upload_user_id: userId,
      file_size: fileSize,
      duration: metadata.format?.duration ? parseFloat(metadata.format.duration) : null,
      recorded_at: videoStartTime.toISOString(),
      raw_metadata: metadata,
      ...(gpsData.length > 0 ? {
        start_latitude: gpsData[0].latitude,
        start_longitude: gpsData[0].longitude,
        end_latitude: gpsData[gpsData.length - 1].latitude,
        end_longitude: gpsData[gpsData.length - 1].longitude
      } : {})
    }

    // Insert video metadata
    const { data: insertedVideo, error: insertError } = await supabaseClient
      .from('video_metadata')
      .insert([videoMetadata])
      .select()
      .single()

    if (insertError) throw new Error(`Failed to insert video metadata: ${insertError.message}`)

    // Step 9: Store clip data in database (assuming we have a clips table)
    if (clipsData.length > 0) {
      const clipsToInsert = clipsData.map(clip => ({
        video_id: insertedVideo.id,
        clip_file_path: clip.clip_file,
        clip_index: clip.clip_index,
        duration: clip.duration,
        pothole_detected: clip.pothole,
        gps_records: clip.gps_data,
        upload_user_id: userId
      }))

      const { error: clipsInsertError } = await supabaseClient
        .from('video_clips')
        .insert(clipsToInsert)

      if (clipsInsertError) {
        console.error('Failed to insert clips:', clipsInsertError)
        // Don't throw here, main video metadata is already saved
      }
    }

    // Step 10: Clean up temporary files
    try {
      await Deno.remove(tempInputPath)
      await Deno.remove(outputDir, { recursive: true })
    } catch (error) {
      console.warn('Cleanup failed:', error)
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully processed video with ${clipsData.length} clips and ${gpsData.length} GPS records`,
        videoId: insertedVideo.id,
        clipsCount: clipsData.length,
        gpsRecordsCount: gpsData.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Processing error:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

// Helper function to run shell commands
async function runCommand(cmd: string[]): Promise<{ stdout: string; stderr: string }> {
  const process = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: 'piped',
    stderr: 'piped',
  })

  const { code, stdout, stderr } = await process.output()
  
  if (code !== 0) {
    throw new Error(`Command failed: ${new TextDecoder().decode(stderr)}`)
  }

  return {
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr)
  }
}

// Helper function to parse GPS data (similar to Python implementation)
function parseGpsData(rawString: string): GPSRecord[] {
  const gpsRecords: GPSRecord[] = []
  const pattern = /(\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}Z)\s*([+-]?\d+\.\d+)\s*([+-]\d+\.\d+)/g
  
  let match
  while ((match = pattern.exec(rawString)) !== null) {
    const [_, timestampStr, latStr, lonStr] = match
    try {
      // Convert timestamp format to ISO string
      const dt = new Date(timestampStr.replace(':', '-').replace(':', '-').replace(' ', 'T'))
      const latitude = parseFloat(latStr)
      const longitude = parseFloat(lonStr)
      
      gpsRecords.push({
        timestamp: dt.toISOString(),
        latitude,
        longitude
      })
    } catch (e) {
      console.error('Error processing GPS record:', e)
    }
  }
  
  return gpsRecords.sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
}

// Helper function to get video start time
function getVideoStartTime(metadata: any, gpsRecords: GPSRecord[]): Date {
  // Try to get from metadata first
  const formatTags = metadata.format?.tags || {}
  
  // Check various timestamp fields
  for (const tag of ['encoded_date', 'creation_time', 'date']) {
    if (formatTags[tag]) {
      try {
        const dateStr = formatTags[tag].replace('UTC', '').trim()
        return new Date(dateStr)
      } catch (e) {
        console.warn(`Failed to parse ${tag}:`, e)
      }
    }
  }
  
  // Fallback to first GPS record if available
  if (gpsRecords.length > 0) {
    return new Date(gpsRecords[0].timestamp)
  }
  
  // Final fallback to current time
  return new Date()
} 