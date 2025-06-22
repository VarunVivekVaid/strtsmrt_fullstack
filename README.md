# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  plugins: {
    // Add the react-x and react-dom plugins
    'react-x': reactX,
    'react-dom': reactDom,
  },
  rules: {
    // other rules...
    // Enable its recommended typescript rules
    ...reactX.configs['recommended-typescript'].rules,
    ...reactDom.configs.recommended.rules,
  },
})
```

# StreetSmart CV

A computer vision application for processing dash cam videos to detect road conditions and extract GPS data.

## Video Upload Workflow

The application implements the following workflow for video uploads:

1. **File Upload**: Videos are uploaded to the `raw-videos/{userId}/{filename}` path in the Supabase storage bucket
2. **Metadata Creation**: An initial entry is created in the `video_metadata` table with:
   - File information (name, path, size)
   - Camera type and user ID
   - Processing status set to `'unprocessed'`
   - Created/updated timestamps
3. **Status Tracking**: The video list shows the current processing status:
   - `unprocessed`: Video uploaded, ready for processing
   - `processing`: Currently being processed
   - `completed`: Processing finished successfully
   - `failed`: Processing failed with error details

### Processing Status Flow

```
Upload → unprocessed → processing → completed/failed
```

### Database Schema

The `video_metadata` table includes:
- `processing_status`: Current status of video processing
- `processing_error`: Error message if processing failed
- `file_path`: Path to the raw video file
- `camera_id`: Type of camera used
- `upload_user_id`: User who uploaded the video

### Storage Structure

```
videos/
├── raw-videos/
│   └── {userId}/
│       └── {filename}
└── processed-clips/
    └── {userId}/
        └── {clip-files}
```

## Features

- Video upload with file validation
- GPS data extraction from dash cam videos
- Pothole detection using computer vision
- Video segmentation into clips
- Real-time processing status updates
- User authentication and authorization
- Admin dashboard for managing all videos

## Setup

1. Install dependencies: `npm install`
2. Set up Supabase project and configure environment variables
3. Run database setup script: `database_setup.sql`
4. Start the development server: `npm run dev`

## Usage

1. Sign up/login to the application
2. Upload your dash cam video file
3. Select your camera type
4. Monitor processing status in the video management section
5. View processed clips and detected potholes
