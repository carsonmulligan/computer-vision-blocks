import * as THREE from 'three';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// App state
const state = {
    mode: 'ready', // 'ready', 'editing', 'orbiting'
    hands: [],
    voxels: new Map(),
    lastOrbitPos: null,
    modeStability: {
        detectedMode: 'ready',
        frameCount: 0,
        requiredFrames: 8, // Must detect same mode for 8 frames before switching
    },
};

// Three.js setup
let scene, camera, renderer, voxelGroup;
const VOXEL_SIZE = 0.3;
const GRID_SIZE = 20;

function initThreeJS() {
    const canvas = document.getElementById('three-canvas');

    // Scene
    scene = new THREE.Scene();
    // Transparent background for AR overlay effect

    // Camera - positioned for AR-like view
    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);

    // Renderer with transparent background
    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.setClearColor(0x000000, 0); // Transparent

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Create group for all voxels (so they can be rotated together)
    voxelGroup = new THREE.Group();
    scene.add(voxelGroup);

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// Voxel management
function createVoxel(x, y, z) {
    const key = `${x},${y},${z}`;
    if (state.voxels.has(key)) return;

    const geometry = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);

    // Add edge geometry for better visibility
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });

    // Cyan/blue color like in reference images
    const material = new THREE.MeshStandardMaterial({
        color: 0x00CED1, // Cyan color
        roughness: 0.3,
        metalness: 0.1,
        transparent: true,
        opacity: 0.9,
    });

    const voxel = new THREE.Mesh(geometry, material);
    const lineSegments = new THREE.LineSegments(edges, lineMaterial);
    voxel.add(lineSegments);

    voxel.position.set(x, y, z);
    voxel.castShadow = true;
    voxel.receiveShadow = true;

    voxelGroup.add(voxel); // Add to group instead of scene
    state.voxels.set(key, voxel);
}

function worldPosFromNormalized(nx, ny, nz) {
    // Convert normalized hand coordinates to world space
    // Map to match video AR overlay - blocks appear where hands are
    // Camera is at (0, 0, 5), FOV 60 degrees

    // Calculate how much of the world space is visible at z=0
    const distance = 5; // Camera z position
    const fov = 60 * Math.PI / 180;
    const viewHeight = 2 * Math.tan(fov / 2) * distance;
    const viewWidth = viewHeight * (window.innerWidth / window.innerHeight);

    // Map normalized coords (0-1) to world space centered at origin
    // Flip X because video is mirrored (scaleX(-1))
    const worldX = -(nx - 0.5) * viewWidth; // Flipped X
    const worldY = -(ny - 0.5) * viewHeight; // Inverted Y
    // Use Z depth from MediaPipe (lower values = closer to camera)
    // Map to range: closer hand = positive Z, further = negative Z
    const worldZ = (0.5 - nz) * 4; // Range: -2 to 2

    // Snap to grid
    const snapX = Math.round(worldX / VOXEL_SIZE) * VOXEL_SIZE;
    const snapY = Math.round(worldY / VOXEL_SIZE) * VOXEL_SIZE;
    const snapZ = Math.round(worldZ / VOXEL_SIZE) * VOXEL_SIZE;

    return { x: snapX, y: snapY, z: snapZ };
}

// Hand tracking
let handLandmarker;
let webcamRunning = false;

async function initMediaPipe() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm"
    );

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
}

async function initWebcam() {
    const video = document.getElementById('webcam');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 }
        });
        video.srcObject = stream;

        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                webcamRunning = true;
                resolve();
            };
        });
    } catch (error) {
        console.error('Error accessing webcam:', error);
        alert('Please allow webcam access to use this app');
    }
}

// Gesture detection
function isPinching(hand) {
    // Check if thumb tip (4) and index finger tip (8) are close
    const thumbTip = hand.landmarks[4];
    const indexTip = hand.landmarks[8];

    const dx = thumbTip.x - indexTip.x;
    const dy = thumbTip.y - indexTip.y;
    const dz = thumbTip.z - indexTip.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    return distance < 0.05; // Threshold for pinch
}

function detectMode(hands) {
    if (!hands || hands.length === 0) {
        return 'ready';
    }

    let pinchCount = 0;
    hands.forEach(hand => {
        if (isPinching(hand)) {
            pinchCount++;
        }
    });

    if (pinchCount === 0) return 'ready';
    if (pinchCount === 1) return 'editing';
    if (pinchCount >= 2) return 'orbiting';

    return 'ready';
}

function updateMode(detectedMode) {
    // Add stickiness to prevent rapid mode oscillation
    if (detectedMode === state.modeStability.detectedMode) {
        state.modeStability.frameCount++;
    } else {
        // New mode detected, reset counter
        state.modeStability.detectedMode = detectedMode;
        state.modeStability.frameCount = 1;
    }

    // Only switch mode if we've seen the same mode for enough frames
    if (state.modeStability.frameCount >= state.modeStability.requiredFrames) {
        if (state.mode !== detectedMode) {
            state.mode = detectedMode;
            const modeElement = document.getElementById('current-mode');
            modeElement.textContent = detectedMode.toUpperCase();
            modeElement.className = `mode-text ${detectedMode}`;

            if (detectedMode !== 'orbiting') {
                state.lastOrbitPos = null;
            }
        }
    }
}

// Hand tracking loop
let lastVideoTime = -1;

function processHands() {
    const video = document.getElementById('webcam');

    if (!webcamRunning || video.currentTime === lastVideoTime) {
        requestAnimationFrame(processHands);
        return;
    }

    lastVideoTime = video.currentTime;

    // Detect hands
    const results = handLandmarker.detectForVideo(video, performance.now());

    // Draw hand landmarks
    drawHandLandmarks(results);

    // Update hands state
    state.hands = results.landmarks || [];

    // Detect and update mode
    const newMode = detectMode(state.hands.map((landmarks, idx) => ({
        landmarks,
        handedness: results.handedness?.[idx]
    })));
    updateMode(newMode);

    // Handle mode-specific actions
    if (state.mode === 'editing' && state.hands.length > 0) {
        handleEditing();
    } else if (state.mode === 'orbiting' && state.hands.length >= 2) {
        handleOrbiting();
    }

    requestAnimationFrame(processHands);
}

function drawHandLandmarks(results) {
    const video = document.getElementById('webcam');
    const canvas = document.getElementById('hand-canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.landmarks) {
        for (const landmarks of results.landmarks) {
            // Draw connections
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 2;

            const connections = [
                [0,1],[1,2],[2,3],[3,4], // Thumb
                [0,5],[5,6],[6,7],[7,8], // Index
                [0,9],[9,10],[10,11],[11,12], // Middle
                [0,13],[13,14],[14,15],[15,16], // Ring
                [0,17],[17,18],[18,19],[19,20], // Pinky
                [5,9],[9,13],[13,17] // Palm
            ];

            connections.forEach(([start, end]) => {
                ctx.beginPath();
                ctx.moveTo(landmarks[start].x * canvas.width, landmarks[start].y * canvas.height);
                ctx.lineTo(landmarks[end].x * canvas.width, landmarks[end].y * canvas.height);
                ctx.stroke();
            });

            // Draw points
            landmarks.forEach((landmark, idx) => {
                const isFingerTip = idx === 4 || idx === 8;
                ctx.fillStyle = isFingerTip ? '#FF0000' : '#00FF00';
                ctx.beginPath();
                ctx.arc(
                    landmark.x * canvas.width,
                    landmark.y * canvas.height,
                    isFingerTip ? 12 : 5, // Bigger dots for thumb and index tips
                    0,
                    2 * Math.PI
                );
                ctx.fill();
            });
        }
    }
}

// Mode handlers
let editCooldown = 0;

function handleEditing() {
    if (editCooldown > 0) {
        editCooldown--;
        return;
    }

    // Find the pinching hand
    for (const hand of state.hands) {
        if (isPinching({ landmarks: hand })) {
            // Use midpoint between thumb tip and index tip for voxel placement
            const thumbTip = hand[4];
            const indexTip = hand[8];
            const midX = (thumbTip.x + indexTip.x) / 2;
            const midY = (thumbTip.y + indexTip.y) / 2;
            const midZ = (thumbTip.z + indexTip.z) / 2;

            const pos = worldPosFromNormalized(midX, midY, midZ);
            createVoxel(pos.x, pos.y, pos.z);
            editCooldown = 10; // Cooldown to prevent too many voxels
            break;
        }
    }
}

function handleOrbiting() {
    if (state.hands.length < 2) return;

    // Find two pinching hands
    const pinchingHands = [];
    for (const hand of state.hands) {
        if (isPinching({ landmarks: hand })) {
            pinchingHands.push(hand);
        }
    }

    if (pinchingHands.length < 2) return;

    // Use average position of both index fingers
    const avgX = (pinchingHands[0][8].x + pinchingHands[1][8].x) / 2;
    const avgY = (pinchingHands[0][8].y + pinchingHands[1][8].y) / 2;

    if (state.lastOrbitPos) {
        const deltaX = (avgX - state.lastOrbitPos.x) * 10;
        const deltaY = (avgY - state.lastOrbitPos.y) * 10;

        // Rotate the voxel group instead of the camera
        voxelGroup.rotation.y += deltaX; // Left-right rotation
        voxelGroup.rotation.x += deltaY; // Up-down rotation
    }

    state.lastOrbitPos = { x: avgX, y: avgY };
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

// Initialize everything
async function init() {
    console.log('Initializing Blocks AI...');

    initThreeJS();
    console.log('Three.js initialized');

    await initMediaPipe();
    console.log('MediaPipe initialized');

    await initWebcam();
    console.log('Webcam initialized');

    processHands();
    animate();

    console.log('Blocks AI ready!');
}

init();
