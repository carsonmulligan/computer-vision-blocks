# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A voxel editor controlled by hand gestures using MediaPipe hand tracking, Three.js for 3D rendering, and MacBook webcam input.

## Hand Gesture Control Modes

The application operates in three distinct modes based on hand gestures:

1. **Ready Mode**: No fingers touching thumbs - vision mode is ready/idle
2. **Editing Mode**: One finger touching one thumb - enables pinch-to-create blocks across planar space
3. **Orbiting Mode**: Two pinches (two fingers on two thumbs) - camera orbit control

## Technology Stack

- **Hand Tracking**: MediaPipe `@mediapipe/tasks-vision` for real-time hand landmark detection
- **3D Rendering**: Three.js for voxel visualization and scene management
- **Build Tool**: Vite for fast development and building
- **Input**: MacBook webcam

## Development Commands

```bash
npm install          # Install dependencies
npm run dev         # Start development server (default: http://localhost:5173)
npm run build       # Build for production
npm run preview     # Preview production build
```

## Architecture

### Core Components

- **main.js**: Main application entry point containing:
  - Three.js scene setup with camera, lighting, and grid
  - MediaPipe HandLandmarker initialization
  - Hand gesture detection and mode switching logic
  - Voxel creation and management
  - Camera orbit controls

### Gesture Detection

- **Pinch Detection**: Measures distance between thumb tip (landmark 4) and index finger tip (landmark 8)
- **Mode Detection**: Counts active pinches across both hands to determine current mode
- **Ready Mode**: 0 pinches - no interaction
- **Editing Mode**: 1 pinch - creates voxels at index finger position
- **Orbiting Mode**: 2 pinches - rotates camera based on hand movement

### Voxel System

- Voxels are 0.5x0.5x0.5 Three.js BoxGeometry meshes
- Stored in a Map with string keys (x,y,z coordinates)
- Hand coordinates are normalized (0-1) and converted to world space
- Positions are snapped to grid for clean placement
- Random HSL colors assigned to each voxel

### Camera Controls

- Orbiting uses spherical coordinates (theta, phi, radius)
- Hand movement delta drives rotation speed
- Camera always looks at world origin (0,0,0)
