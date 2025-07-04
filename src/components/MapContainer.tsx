import { useEffect, useRef, useState } from 'react'
import { Box, Text, Select, VStack, Button, Alert, AlertIcon } from '@chakra-ui/react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { VideoDatabase } from '../services/videoDatabase'
import type { VideoMetadata } from '../types/video'

// Fix for default markers in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

interface MapContainerProps {
  center?: [number, number]
  zoom?: number
  height?: string
  width?: string
  userId?: string
}

export default function MapContainer({ 
  center = [40.7128, -74.0060], // Default to New York City
  zoom = 13,
  height = "400px",
  width = "100%",
  userId
}: MapContainerProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const [videos, setVideos] = useState<VideoMetadata[]>([])
  const [selectedVideo, setSelectedVideo] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const polylineRef = useRef<L.Polyline | null>(null)

  // Fetch videos when component mounts or userId changes
  useEffect(() => {
    if (!userId) return
    
    const fetchVideos = async () => {
      try {
        setLoading(true)
        setError('')
        const userVideos = await VideoDatabase.getUserVideoMetadata(userId)
        setVideos(userVideos)
      } catch (err) {
        console.error('Error fetching videos:', err)
        setError('Failed to load videos')
      } finally {
        setLoading(false)
      }
    }

    fetchVideos()
  }, [userId])

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return

    // Initialize the map
    const map = L.map(mapRef.current).setView(center, zoom)
    mapInstanceRef.current = map

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)

    // Add a marker at the center
    L.marker(center).addTo(map)
      .bindPopup('Current Location')
      .openPopup()

    // Cleanup function
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [center, zoom])

  // Handle video selection and draw polyline
  const handleVideoSelect = (videoId: string) => {
    if (!mapInstanceRef.current || !videoId) return

    setSelectedVideo(videoId)
    
    // Remove existing polyline
    if (polylineRef.current) {
      mapInstanceRef.current.removeLayer(polylineRef.current)
      polylineRef.current = null
    }

    const video = videos.find(v => v.id === videoId)
    if (!video || !video.start_latitude || !video.start_longitude || 
        !video.end_latitude || !video.end_longitude) {
      console.log('Video does not have complete GPS coordinates')
      return
    }

    // Create polyline from start to end coordinates
    const polyline = L.polyline([
      [video.start_latitude, video.start_longitude],
      [video.end_latitude, video.end_longitude]
    ], {
      color: 'red',
      weight: 3,
      opacity: 0.8
    }).addTo(mapInstanceRef.current)

    polylineRef.current = polyline

    // Add markers for start and end points
    const startMarker = L.marker([video.start_latitude, video.start_longitude])
      .addTo(mapInstanceRef.current)
      .bindPopup(`Start: ${video.file_name}`)

    const endMarker = L.marker([video.end_latitude, video.end_longitude])
      .addTo(mapInstanceRef.current)
      .bindPopup(`End: ${video.file_name}`)

    // Fit map to show the entire route
    const bounds = L.latLngBounds([
      [video.start_latitude, video.start_longitude],
      [video.end_latitude, video.end_longitude]
    ])
    mapInstanceRef.current.fitBounds(bounds, { padding: [20, 20] })
  }

  return (
    <VStack spacing={4} align="stretch">
      <Text fontSize="lg" fontWeight="medium" mb={2}>
        Interactive Map
      </Text>
      
      <Box
        ref={mapRef}
        height={height}
        width={width}
        borderRadius="md"
        overflow="hidden"
        border="1px solid"
        borderColor="gray.200"
      />

      {/* Video Selection Dropdown */}
      {userId && (
        <Box>
          <Text fontSize="md" fontWeight="medium" mb={2}>
            Select Video Route
          </Text>
          <Select
            placeholder="Choose a video to display its route"
            value={selectedVideo}
            onChange={(e) => handleVideoSelect(e.target.value)}
            disabled={loading}
          >
            {videos.map((video) => (
              <option key={video.id} value={video.id}>
                {video.file_name} - {video.processing_status}
              </option>
            ))}
          </Select>
          
          {error && (
            <Alert status="error" mt={2}>
              <AlertIcon />
              {error}
            </Alert>
          )}
          
          {videos.length === 0 && !loading && (
            <Text fontSize="sm" color="gray.600" mt={2}>
              No videos found. Upload a video to see its route on the map.
            </Text>
          )}
        </Box>
      )}
    </VStack>
  )
} 