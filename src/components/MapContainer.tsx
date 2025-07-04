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

  // Helper function to calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371 // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
  }

  // Helper function to calculate total route distance
  const calculateTotalDistance = (coordinates: [number, number][]): number => {
    if (coordinates.length < 2) return 0
    
    let totalDistance = 0
    for (let i = 1; i < coordinates.length; i++) {
      totalDistance += calculateDistance(
        coordinates[i-1][0], coordinates[i-1][1],
        coordinates[i][0], coordinates[i][1]
      )
    }
    return totalDistance
  }

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
    
    // Remove existing polyline and markers
    if (polylineRef.current) {
      mapInstanceRef.current.removeLayer(polylineRef.current)
      polylineRef.current = null
    }

    // Clear existing markers (we'll add new ones)
    mapInstanceRef.current.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        mapInstanceRef.current!.removeLayer(layer)
      }
    })

    const video = videos.find(v => v.id === videoId)
    if (!video) {
      console.log('Video not found')
      return
    }

    // Extract GPS coordinates from raw_metadata
    let gpsCoordinates: [number, number][] = []
    
    if (video.raw_metadata && video.raw_metadata.gpsData && Array.isArray(video.raw_metadata.gpsData)) {
      // Use all GPS coordinates from metadata
      gpsCoordinates = video.raw_metadata.gpsData.map((point: any) => [
        point.latitude,
        point.longitude
      ])
      console.log(`Using ${gpsCoordinates.length} GPS coordinates from metadata`)
    } else if (video.start_latitude && video.start_longitude && video.end_latitude && video.end_longitude) {
      // Fallback to start and end coordinates only
      gpsCoordinates = [
        [video.start_latitude, video.start_longitude],
        [video.end_latitude, video.end_longitude]
      ]
      console.log('Using start and end coordinates only (no detailed GPS data)')
    } else {
      console.log('Video does not have GPS coordinates')
      return
    }

    if (gpsCoordinates.length === 0) {
      console.log('No GPS coordinates available')
      return
    }

    // Create polyline with all coordinates
    const polyline = L.polyline(gpsCoordinates, {
      color: 'red',
      weight: 3,
      opacity: 0.8
    }).addTo(mapInstanceRef.current)

    polylineRef.current = polyline

    // Add markers for start and end points
    const startCoord = gpsCoordinates[0]
    const endCoord = gpsCoordinates[gpsCoordinates.length - 1]
    
    const startMarker = L.marker(startCoord)
      .addTo(mapInstanceRef.current)
      .bindPopup(`Start: ${video.file_name}`)

    const endMarker = L.marker(endCoord)
      .addTo(mapInstanceRef.current)
      .bindPopup(`End: ${video.file_name}`)

    // Add intermediate markers if there are many coordinates
    // We use every 10th point to avoid cluttering the map with too many markers
    // This provides a good balance between showing route progress and keeping the map readable
    if (gpsCoordinates.length > 10) {
      for (let i = 10; i < gpsCoordinates.length - 1; i += 10) {
        const coord = gpsCoordinates[i]
        const progress = Math.round((i / (gpsCoordinates.length - 1)) * 100)
        L.marker(coord, {
          icon: L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background-color: #3182ce; width: 8px; height: 8px; border-radius: 50%; border: 2px solid white;"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          })
        })
        .addTo(mapInstanceRef.current)
        .bindPopup(`${progress}% through route`)
      }
    }

    // Fit map to show the entire route
    const bounds = L.latLngBounds(gpsCoordinates)
    mapInstanceRef.current.fitBounds(bounds, { padding: [20, 20] })

    // Calculate and display route information
    const totalDistance = calculateTotalDistance(gpsCoordinates)
    console.log(`Route drawn with ${gpsCoordinates.length} points`)
    console.log(`Start: ${startCoord[0].toFixed(6)}, ${startCoord[1].toFixed(6)}`)
    console.log(`End: ${endCoord[0].toFixed(6)}, ${endCoord[1].toFixed(6)}`)
    console.log(`Total route distance: ${totalDistance.toFixed(2)} km`)
    
    // Update popup with distance information
    if (gpsCoordinates.length > 2) {
      startMarker.setPopupContent(`Start: ${video.file_name}<br>Distance: ${totalDistance.toFixed(2)} km`)
      endMarker.setPopupContent(`End: ${video.file_name}<br>Distance: ${totalDistance.toFixed(2)} km`)
    }
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