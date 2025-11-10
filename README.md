# Blocks AI

A gesture-controlled voxel editor using MediaPipe hand tracking and Three.js.

## Features

- Real-time hand tracking using your webcam
- Three interaction modes controlled by hand gestures:
  - **Ready Mode**: No pinches - idle state
  - **Editing Mode**: One pinch - create colorful voxels in 3D space
  - **Orbiting Mode**: Two pinches - rotate the camera around your scene
- Live video feed with hand landmark visualization
- Interactive 3D voxel grid

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Then open your browser to `http://localhost:5173` and allow webcam access when prompted.

## How to Use

1. Position your hands in front of your webcam
2. Make no pinches (thumb-index finger touch) to stay in Ready Mode
3. Pinch with one hand to enter Editing Mode and create voxels where you point
4. Pinch with both hands to enter Orbiting Mode and rotate the camera

## Technology

- MediaPipe Tasks Vision for hand tracking
- Three.js for 3D rendering
- Vite for fast development
