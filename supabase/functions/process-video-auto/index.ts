import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ProcessVideoRequest {
  filePath: string
  userId: string
  cameraId: string
  originalFileName: string
  fileSize: number
  videoMetadataId: string
}

interface GPSRecord {
  timestamp: string
  latitude: number
  longitude: number
}

export default async function handler(req: Request) {
  try {
    // 1) Init Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2) Parse & validate
    const { filePath, userId, cameraId, originalFileName, fileSize, videoMetadataId }: ProcessVideoRequest = await req.json()
    
    if (!filePath || !userId || !cameraId) {
      throw new Error('Missing required parameters')
    }
    
    console.log(`⏳ Processing ${filePath} for user ${userId}`)
    
    // Update status to processing
    await supabase
      .from('video_metadata')
      .update({ processing_status: 'processing' })
      .eq('id', videoMetadataId)

    // 3) Download to /tmp
    const { data: fileData, error: dlErr } = await supabase.storage
      .from('videos')
      .download(filePath)
    
    if (dlErr || !fileData) {
      throw new Error(`Download failed: ${dlErr?.message}`)
    }
    
    const tempInput = `/tmp/input_${Date.now()}.mp4`
    await Deno.writeFile(tempInput, new Uint8Array(await fileData.arrayBuffer()))

    // 4) FFprobe: full format+streams JSON
    const { stdout: metaJson } = await runCommand([
      'ffprobe', '-v', 'error', '-print_format', 'json', 
      '-show_format', '-show_streams', tempInput
    ])
    const metadata = JSON.parse(metaJson)

    // 5) ExifTool: raw GPS block → parse into [{ timestamp, latitude, longitude }]
    let gpsData: GPSRecord[] = []
    if (cameraId === 'garmin_dashcam') {
      try {
        const { stdout: rawGps } = await runCommand(['exiftool', '-ee', '-b', tempInput])
        gpsData = parseGpsData(rawGps)
        console.log(`✅ Extracted ${gpsData.length} GPS points`)
      } catch (error) {
        console.warn('GPS extraction failed:', error)
      }
    }

    // 6) Determine start time (tags → gps fallback)
    const videoStart = getVideoStartTime(metadata, gpsData)

    // 7) Update the existing video_metadata record
    const updateData: any = {
      duration: metadata.format?.duration ? +metadata.format.duration : null,
      recorded_at: videoStart.toISOString(),
      raw_metadata: metadata,
      processing_status: 'completed'
    }

    if (gpsData.length > 0) {
      updateData.start_latitude = gpsData[0].latitude
      updateData.start_longitude = gpsData[0].longitude
      updateData.end_latitude = gpsData[gpsData.length - 1].latitude
      updateData.end_longitude = gpsData[gpsData.length - 1].longitude
    }

    const { error: updateErr } = await supabase
      .from('video_metadata')
      .update(updateData)
      .eq('id', videoMetadataId)

    if (updateErr) {
      throw new Error(`DB update failed: ${updateErr.message}`)
    }

    // 8) Segment video into clips (optional - can be done later)
    await processVideoClips(supabase, tempInput, videoMetadataId, gpsData, videoStart, userId)

    // 9) Cleanup
    await Deno.remove(tempInput)

    console.log(`✅ Successfully processed ${filePath}`)
    
    return new Response(JSON.stringify({
      success: true,
      videoId: videoMetadataId,
      gpsCount: gpsData.length
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (err) {
    console.error('Processing error:', err)
    
    // Update status to failed if we have the videoMetadataId
    try {
      const body = await req.clone().json()
      if (body.videoMetadataId) {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )
        await supabase
          .from('video_metadata')
          .update({ 
            processing_status: 'failed',
            processing_error: err.message 
          })
          .eq('id', body.videoMetadataId)
      }
    } catch (updateError) {
      console.error('Failed to update error status:', updateError)
    }

    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
}

async function processVideoClips(
  supabase: any,
  tempInput: string,
  videoId: string,
  gpsData: GPSRecord[],
  videoStart: Date,
  userId: string
) {
  try {
    // Segment video into 10-second clips
    const segmentLength = 10
    const outputDir = `/tmp/clips_${Date.now()}`
    await Deno.mkdir(outputDir, { recursive: true })
    
    const outputPattern = `${outputDir}/clip_%03d.mp4`
    
    await runCommand([
      'ffmpeg', '-i', tempInput,
      '-c', 'copy', '-map_metadata', '0',
      '-f', 'segment', '-segment_time', segmentLength.toString(),
      '-reset_timestamps', '1',
      outputPattern
    ])

    // Process generated clips
    const clipFiles = []
    for await (const dirEntry of Deno.readDir(outputDir)) {
      if (dirEntry.name.endsWith('.mp4') && dirEntry.name.includes('clip_')) {
        clipFiles.push(dirEntry.name)
      }
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
        const clipStartTime = new Date(videoStart.getTime() + (i * segmentLength * 1000))
        const clipEndTime = new Date(clipStartTime.getTime() + (segmentLength * 1000))
        
        const clipGpsData = gpsData.filter(record => {
          const recordTime = new Date(record.timestamp)
          return recordTime >= clipStartTime && recordTime < clipEndTime
        })

        // Upload clip to storage
        const clipData = await Deno.readFile(fullClipPath)
        const clipStoragePath = `processed-clips/${userId}/${clipFile}`
        
        const { error: clipUploadError } = await supabase.storage
          .from('videos')
          .upload(clipStoragePath, clipData)

        if (clipUploadError) {
          console.error(`Failed to upload clip ${clipFile}:`, clipUploadError)
          continue
        }

        // Insert clip record
        await supabase
          .from('video_clips')
          .insert({
            video_id: videoId,
            clip_file_path: clipStoragePath,
            clip_index: i,
            duration: duration,
            pothole_detected: false,
            gps_records: clipGpsData,
            upload_user_id: userId
          })
      }
    }

    // Clean up clip directory
    await Deno.remove(outputDir, { recursive: true })
  } catch (error) {
    console.error('Clip processing failed:', error)
  }
}

/** Runs a shell command and returns stdout/stderr or throws on non-zero exit */
async function runCommand(cmd: string[]): Promise<{ stdout: string; stderr: string }> {
  const proc = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: 'piped',
    stderr: 'piped'
  })
  
  const { code, stdout, stderr } = await proc.output()
  
  if (code !== 0) {
    const msg = new TextDecoder().decode(stderr)
    throw new Error(`Command failed (${cmd.join(' ')}): ${msg}`)
  }
  
  return {
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr)
  }
}

/** Parses the raw ExifTool dump into GPS records */
function parseGpsData(raw: string): GPSRecord[] {
  const re = /(\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}Z)\s*([+-]?\d+\.\d+)\s*([+-]\d+\.\d+)/g
  const records: GPSRecord[] = []
  let m
  
  while ((m = re.exec(raw)) !== null) {
    const [_, ts, lat, lon] = m
    // Convert YYYY:MM:DD HH:MM:SSZ to ISO string
    const iso = new Date(ts.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')).toISOString()
    records.push({
      timestamp: iso,
      latitude: +lat,
      longitude: +lon
    })
  }
  
  // Sort by timestamp
  return records.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

/** Mimics video start time logic (tags → gps → now) */
function getVideoStartTime(metadata: any, gps: GPSRecord[]): Date {
  const tags = metadata.format?.tags || {}
  
  for (const key of ['encoded_date', 'creation_time']) {
    if (tags[key]) {
      // Strip "UTC" if present
      const txt = tags[key].replace('UTC', '').trim()
      const dt = new Date(txt)
      if (!isNaN(dt.getTime())) return dt
    }
  }
  
  if (gps.length > 0) {
    return new Date(gps[0].timestamp)
  }
  
  return new Date()
} 