// Core application state
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const penToolBtn = document.getElementById('penTool');
const eraserToolBtn = document.getElementById('eraserTool');
const strokeSizeSlider = document.getElementById('strokeSize');
const strokeSizeValue = document.getElementById('strokeSizeValue');
const strokeColorPicker = document.getElementById('strokeColor');
const clearActiveLayerBtn = document.getElementById('clearActiveLayerBtn');
const clearAllLayersBtn = document.getElementById('clearAllLayersBtn');
const globalAnimationToggle = document.getElementById('globalAnimationToggle');

const animationSliders = {
    wiggleIntensity: { slider: document.getElementById('wiggleIntensity'), valueEl: document.getElementById('wiggleIntensityValue'), suffix: '' },
    breathingStroke: { slider: document.getElementById('breathingStroke'), valueEl: document.getElementById('breathingStrokeValue'), suffix: '' },
    shakeIntensity: { slider: document.getElementById('shakeIntensity'), valueEl: document.getElementById('shakeIntensityValue'), suffix: '' },
    animationSpeed: { slider: document.getElementById('animationSpeed'), valueEl: document.getElementById('animationSpeedValue'), suffix: 'x' }
};

const saveBtn = document.getElementById('saveBtn');
const loadInput = document.getElementById('loadInput');
const exportMp4Btn = document.getElementById('exportMp4Btn'); 
const exportGifBtn = document.getElementById('exportGifBtn'); 
const loadingIndicator = document.getElementById('loadingIndicator');
const loadingText = document.getElementById('loadingText'); 
const messageModal = document.getElementById('messageModal');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const layersListContainer = document.getElementById('layersList');
const addLayerBtn = document.getElementById('addLayerBtn');
const selectedLayerOpacityControl = document.getElementById('selectedLayerOpacityControl');
const layerOpacitySlider = document.getElementById('layerOpacity');
const layerOpacityValue = document.getElementById('layerOpacityValue');
const controlPanel = document.getElementById('controlPanel');
const controlPanelToggle = document.getElementById('controlPanelToggle');
const canvasContainer = document.getElementById('canvasContainer');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

// Application state
let isDrawing = false;
let currentTool = 'pen';
let currentStrokeSize = 10;
let currentStrokeColor = '#000000';
let layers = [];
let activeLayerId = null;
let lastX, lastY;
let animationFrameId;
let time = 0; 
let undoStack = [];
let redoStack = [];
let isAnimationPlaying = false;

// Canvas dimensions
const WORLD_WIDTH = 1920;
const WORLD_HEIGHT = 1080;
let viewTransform = { scale: 1, offsetX: 0, offsetY: 0 };
const EXPORT_WIDTH = 1920; 
const EXPORT_HEIGHT = 1080; 

// FFmpeg setup
const { createFFmpeg, fetchFile } = FFmpeg;
let ffmpeg; 

// Utility functions
function generateLayerId() { 
    return Date.now() + Math.random().toString(36).substr(2, 9); 
}

function getActiveLayer() { 
    return layers.find(layer => layer.id === activeLayerId); 
}

function getLayerIndex(layerId) { 
    return layers.findIndex(l => l.id === layerId); 
}

// Canvas management
function setupCanvasDimensions() {
    const container = canvasContainer;
    const containerRect = container.getBoundingClientRect();
    
    // Calculate the best fit for the canvas while maintaining aspect ratio
    const aspectRatio = WORLD_WIDTH / WORLD_HEIGHT;
    const containerAspectRatio = containerRect.width / containerRect.height;
    
    let displayWidth, displayHeight;
    
    if (containerAspectRatio > aspectRatio) {
        // Container is wider than canvas aspect ratio
        displayHeight = Math.min(containerRect.height - 20, 800);
        displayWidth = displayHeight * aspectRatio;
    } else {
        // Container is taller than canvas aspect ratio
        displayWidth = Math.min(containerRect.width - 20, 1200);
        displayHeight = displayWidth / aspectRatio;
    }
    
    // Set canvas internal dimensions (for drawing)
    canvas.width = WORLD_WIDTH;
    canvas.height = WORLD_HEIGHT;
    
    // Set canvas display size (CSS)
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    
    drawScene();
}

function getCanvasPointerPos(event) { 
    const rect = canvas.getBoundingClientRect();
    const scaleX = WORLD_WIDTH / rect.width;
    const scaleY = WORLD_HEIGHT / rect.height;
    
    return { 
        x: (event.clientX - rect.left) * scaleX, 
        y: (event.clientY - rect.top) * scaleY 
    };
}

// Tool management
function setActiveToolButton(activeBtn) {
    [penToolBtn, eraserToolBtn].forEach(btn => btn.classList.remove('active-tool'));
    if (activeBtn) activeBtn.classList.add('active-tool');
    updateCanvasCursor(); 
}

function updateCanvasCursor() {
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / WORLD_WIDTH;
    const size = Math.max(2, currentStrokeSize * scale);
    
    let cursorSVG;
    if (currentTool === 'pen') {
        cursorSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="rgba(0,0,0,0.5)"/></svg>`;
        canvas.style.cursor = `url('data:image/svg+xml;utf8,${encodeURIComponent(cursorSVG)}') ${size/2} ${size/2}, auto`;
    } else if (currentTool === 'eraser') {
        const outlineWidth = Math.max(1, Math.min(2, size / 10)); 
        cursorSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2 - outlineWidth/2}" fill="rgba(255,255,255,0.5)" stroke="rgba(0,0,0,0.7)" stroke-width="${outlineWidth}"/></svg>`;
        canvas.style.cursor = `url('data:image/svg+xml;utf8,${encodeURIComponent(cursorSVG)}') ${size/2} ${size/2}, auto`;
    } else {
        canvas.style.cursor = 'default';
    }
}

// Animation control
function toggleAnimation() {
    isAnimationPlaying = !isAnimationPlaying;
    
    if (isAnimationPlaying) {
        globalAnimationToggle.innerHTML = '<i class="fas fa-pause"></i> <span>Pause Animation</span>';
        globalAnimationToggle.classList.add('btn-danger');
        globalAnimationToggle.classList.remove('btn-primary');
        animate();
    } else {
        globalAnimationToggle.innerHTML = '<i class="fas fa-play"></i> <span>Start Animation</span>';
        globalAnimationToggle.classList.add('btn-primary');
        globalAnimationToggle.classList.remove('btn-danger');
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        // Draw static scene
        drawScene();
    }
}

function animate() { 
    if (!isAnimationPlaying) return;
    
    time += 1; 
    drawScene(); 
    animationFrameId = requestAnimationFrame(animate); 
}

// Undo/Redo system
function saveStateForUndo() {
    const state = { 
        layers: JSON.parse(JSON.stringify(layers)), 
        activeLayerId: activeLayerId, 
        viewTransform: { ...viewTransform } 
    };
    undoStack.push(state);
    if (undoStack.length > 30) undoStack.shift();
    redoStack = []; 
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
    undoBtn.classList.toggle('btn-disabled', undoBtn.disabled);
    redoBtn.classList.toggle('btn-disabled', redoBtn.disabled);
}

// Modal system
function showModal(title, message, customButtons = null, isCustom = false) {
    modalTitle.textContent = title;
    modalMessage.innerHTML = message; 
    const buttonContainer = messageModal.querySelector('.modal-button-container');
    buttonContainer.innerHTML = ''; 
    
    if (isCustom && customButtons && customButtons.length > 0) {
        customButtons.forEach(btnConfig => {
            const button = document.createElement('button');
            button.textContent = btnConfig.text;
            button.className = `btn modal-button ${btnConfig.class || 'btn-primary'}`;
            button.onclick = btnConfig.action;
            buttonContainer.appendChild(button);
        });
    } else {
        const closeButton = document.createElement('button');
        closeButton.className = 'btn modal-button btn-primary';
        closeButton.textContent = 'Close';
        closeButton.onclick = () => closeModal(messageModal);
        buttonContainer.appendChild(closeButton);
    }
    messageModal.classList.remove('hidden');
}

function closeModal(modalElement) { 
    modalElement.classList.add('hidden'); 
}

// Layer management
function createNewLayer(nameSuffix = layers.length + 1, strokes = [], customAnimationSettings = null, isVisible = true, opacity = 1, isActive = false) {
    const defaultAnimSettings = {};
    for (const key in animationSliders) {
        defaultAnimSettings[key] = parseFloat(animationSliders[key].slider.defaultValue || animationSliders[key].slider.value);
    }
    return {
        id: generateLayerId(), 
        name: `Layer ${nameSuffix}`, 
        strokes: strokes,
        animationSettings: customAnimationSettings || defaultAnimSettings,
        isVisible: isVisible, 
        opacity: opacity, 
        isActive: isActive
    };
}

function addLayer() {
    saveStateForUndo();
    const newLayer = createNewLayer(layers.length + 1);
    const activeLayerIndex = getLayerIndex(activeLayerId);
    if (activeLayerIndex !== -1 && activeLayerIndex < layers.length - 1) {
        layers.splice(activeLayerIndex + 1, 0, newLayer);
    } else {
        layers.push(newLayer); 
    }
    setActiveLayer(newLayer.id); 
    updateAnimationSlidersForActiveLayer();
}

function setActiveLayer(layerId) {
    const previouslyActiveLayer = getActiveLayer();
    if (previouslyActiveLayer) previouslyActiveLayer.isActive = false;
    
    activeLayerId = layerId;
    const currentActiveLayer = getActiveLayer();
    
    if (currentActiveLayer) {
        currentActiveLayer.isActive = true;
        layerOpacitySlider.value = currentActiveLayer.opacity * 100;
        layerOpacityValue.textContent = Math.round(currentActiveLayer.opacity * 100);
        selectedLayerOpacityControl.classList.remove('hidden');
    } else {
        selectedLayerOpacityControl.classList.add('hidden');
    }
    
    renderLayersList(); 
    updateAnimationSlidersForActiveLayer();
}

function renderLayersList() {
    layersListContainer.innerHTML = ''; 
    
    if (layers.length === 0) {
        layersListContainer.innerHTML = '<p class="text-gray-500 text-sm p-2 text-center">No layers yet.</p>';
        selectedLayerOpacityControl.classList.add('hidden'); 
        return;
    }
    
    [...layers].reverse().forEach((layer) => { 
        const item = document.createElement('div');
        item.className = `layer-item ${layer.id === activeLayerId ? 'active-layer' : ''}`;
        item.dataset.layerId = layer.id;
        item.onclick = () => setActiveLayer(layer.id);
        
        const visibilityBtn = document.createElement('button');
        visibilityBtn.className = 'btn btn-sm';
        visibilityBtn.innerHTML = `<i class="fas ${layer.isVisible ? 'fa-eye' : 'fa-eye-slash'}"></i>`;
        visibilityBtn.title = layer.isVisible ? "Hide Layer" : "Show Layer";
        visibilityBtn.onclick = (e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); };
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'layer-name'; 
        nameSpan.textContent = layer.name; 
        nameSpan.title = "Double-click to Rename";
        nameSpan.ondblclick = (e) => { e.stopPropagation(); makeLayerNameEditable(layer.id, nameSpan); };
        
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'layer-controls';
        
        const upBtn = document.createElement('button'); 
        upBtn.className = 'btn btn-sm'; 
        upBtn.innerHTML = '<i class="fas fa-arrow-up"></i>'; 
        upBtn.title = "Move Up";
        upBtn.disabled = getLayerIndex(layer.id) === layers.length - 1; 
        upBtn.onclick = (e) => { e.stopPropagation(); moveLayer(layer.id, 'up'); };
        if(upBtn.disabled) upBtn.classList.add('btn-disabled');
        
        const downBtn = document.createElement('button'); 
        downBtn.className = 'btn btn-sm'; 
        downBtn.innerHTML = '<i class="fas fa-arrow-down"></i>'; 
        downBtn.title = "Move Down";
        downBtn.disabled = getLayerIndex(layer.id) === 0; 
        downBtn.onclick = (e) => { e.stopPropagation(); moveLayer(layer.id, 'down'); };
        if(downBtn.disabled) downBtn.classList.add('btn-disabled');

        const deleteBtn = document.createElement('button'); 
        deleteBtn.className = 'btn btn-sm btn-danger'; 
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>'; 
        deleteBtn.title = "Delete Layer";
        deleteBtn.onclick = (e) => { e.stopPropagation(); deleteLayer(layer.id); };
        
        controlsDiv.append(upBtn, downBtn, deleteBtn);
        item.append(visibilityBtn, nameSpan, controlsDiv);
        layersListContainer.appendChild(item);
    });
    
    const activeLayer = getActiveLayer();
    if (activeLayer) selectedLayerOpacityControl.classList.remove('hidden');
    else selectedLayerOpacityControl.classList.add('hidden');
}

function makeLayerNameEditable(layerId, nameSpan) {
    const layer = layers.find(l => l.id === layerId); 
    if (!layer) return;
    
    const input = document.createElement('input'); 
    input.type = 'text'; 
    input.className = 'layer-name-input'; 
    input.value = layer.name;
    nameSpan.replaceWith(input); 
    input.focus(); 
    input.select();
    
    const saveName = () => {
        saveStateForUndo(); 
        layer.name = input.value.trim() || `Layer ${getLayerIndex(layerId) + 1}`;
        renderLayersList();
    };
    
    input.onblur = saveName; 
    input.onkeydown = (e) => { 
        if (e.key === 'Enter') input.blur(); 
        else if (e.key === 'Escape') { 
            input.value = layer.name; 
            input.blur(); 
            renderLayersList(); 
        }
    };
}

function toggleLayerVisibility(layerId) {
    saveStateForUndo(); 
    const layer = layers.find(l => l.id === layerId);
    if (layer) layer.isVisible = !layer.isVisible; 
    renderLayersList(); 
    drawScene();
}

function deleteLayer(layerId) {
    if (layers.length <= 1) { 
        showModal("Action Denied", "Cannot delete the last layer."); 
        return; 
    }
    
    const layerToDelete = layers.find(l => l.id === layerId); 
    if (!layerToDelete) return;
    
    showModal("Confirm Deletion", `Delete layer "${layerToDelete.name}"?`, 
    [
        { 
            text: "Delete", 
            class: 'btn-danger', 
            action: () => {
                saveStateForUndo(); 
                const deletedLayerIndex = getLayerIndex(layerId);
                layers = layers.filter(l => l.id !== layerId);
                
                if (activeLayerId === layerId) {
                    if (layers.length > 0) {
                        setActiveLayer(layers[Math.max(0, deletedLayerIndex - 1)].id);
                    } else {
                        activeLayerId = null; 
                    }
                }
                renderLayersList(); 
                drawScene(); 
                closeModal(messageModal);
            }
        },
        { 
            text: "Cancel", 
            class: 'btn', 
            action: () => closeModal(messageModal) 
        }
    ], true);
}

function moveLayer(layerId, direction) {
    saveStateForUndo(); 
    const index = getLayerIndex(layerId); 
    if (index === -1) return;
    
    if (direction === 'up' && index < layers.length - 1) {
        [layers[index], layers[index + 1]] = [layers[index + 1], layers[index]];
    } else if (direction === 'down' && index > 0) {
        [layers[index], layers[index - 1]] = [layers[index - 1], layers[index]];
    }
    
    renderLayersList(); 
    drawScene();
}

function updateAnimationSlidersForActiveLayer() {
    const activeLayer = getActiveLayer();
    
    if (activeLayer) {
        for (const key in animationSliders) {
            const setting = activeLayer.animationSettings[key];
            if (setting !== undefined) {
                animationSliders[key].slider.value = setting;
                animationSliders[key].valueEl.textContent = setting + (animationSliders[key].suffix || '');
            }
        }
    } else {
        for (const key in animationSliders) {
            animationSliders[key].slider.value = animationSliders[key].slider.defaultValue || 0;
            animationSliders[key].valueEl.textContent = (animationSliders[key].slider.defaultValue || 0) + (animationSliders[key].suffix || '');
        }
    }
}

// Drawing functions
function isPointInCircle(px, py, cx, cy, radius) {
    const dx = px - cx; 
    const dy = py - cy;
    return dx * dx + dy * dy <= radius * radius;
}

function handlePointerDown(event) {
    if (!event.isPrimary || (currentTool !== 'pen' && currentTool !== 'eraser')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    
    const activeLayer = getActiveLayer();
    if (!activeLayer || !activeLayer.isVisible) return; 
    
    saveStateForUndo(); 
    isDrawing = true;
    canvas.setPointerCapture(event.pointerId);
    
    const { x, y } = getCanvasPointerPos(event);
    
    if (currentTool === 'pen') {
        activeLayer.strokes.push({
            id: generateLayerId(), 
            points: [{ x: x, y: y }], 
            color: currentStrokeColor, 
            size: currentStrokeSize, 
            tool: currentTool, 
            originalSize: currentStrokeSize, 
            birthTime: time
        });
    }
    
    lastX = x; 
    lastY = y; 
}

function handlePointerMove(event) {
    if (!isDrawing || !event.isPrimary) return;
    
    const activeLayer = getActiveLayer();
    if (!activeLayer || !activeLayer.isVisible) return;
    
    const events = (typeof event.getCoalescedEvents === 'function') ? event.getCoalescedEvents() : [event];
    
    for (const coalescedEvent of events) {
        const { x, y } = getCanvasPointerPos(coalescedEvent); 
        
        if (currentTool === 'eraser') {
            const eraserRadiusWorld = currentStrokeSize / 2; 
            let erasedSomething = false;
            
            for (let i = activeLayer.strokes.length - 1; i >= 0; i--) {
                const stroke = activeLayer.strokes[i];
                if (stroke.tool === 'pen') { 
                    let hit = false;
                    for (const p of stroke.points) {
                        if (isPointInCircle(p.x, p.y, x, y, eraserRadiusWorld)) {
                            hit = true; 
                            break;
                        }
                    }
                    if (hit) { 
                        activeLayer.strokes.splice(i, 1); 
                        erasedSomething = true; 
                    }
                }
            }
            
            if (erasedSomething) drawScene();
            lastX = x; 
            lastY = y; 
        } else if (currentTool === 'pen') {
            const currentPath = activeLayer.strokes[activeLayer.strokes.length - 1];
            if (!currentPath || currentPath.tool !== 'pen') { 
                isDrawing = false; 
                return; 
            }
            
            currentPath.points.push({ x: x, y: y });
            
            // Immediate drawing feedback
            ctx.save();
            ctx.globalAlpha = activeLayer.opacity; 
            ctx.globalCompositeOperation = 'source-over';
            ctx.beginPath(); 
            ctx.moveTo(lastX, lastY); 
            ctx.lineTo(x, y);         
            ctx.strokeStyle = currentPath.color; 
            ctx.lineWidth = currentPath.size;
            ctx.lineCap = 'round'; 
            ctx.lineJoin = 'round'; 
            ctx.stroke();
            ctx.restore();
            
            lastX = x; 
            lastY = y; 
        }
    }
}

function handlePointerUp(event) { 
    if (!event.isPrimary) return;
    
    if (isDrawing) {
        isDrawing = false;
        canvas.releasePointerCapture(event.pointerId);
        if(currentTool === 'eraser') { 
            drawScene(); 
        }
    }
}

// Main drawing function
function drawScene(isExporting = false, exportTimeOverride = null) {
    const currentTime = isExporting ? exportTimeOverride : time;
    const targetCtx = ctx; 
    const currentCanvasWidth = isExporting ? EXPORT_WIDTH : canvas.width;
    const currentCanvasHeight = isExporting ? EXPORT_HEIGHT : canvas.height;

    if (canvas.width !== currentCanvasWidth || canvas.height !== currentCanvasHeight) {
        canvas.width = currentCanvasWidth; 
        canvas.height = currentCanvasHeight;
    }
    
    // Clear canvas with white background
    targetCtx.fillStyle = '#FFFFFF'; 
    targetCtx.fillRect(0, 0, currentCanvasWidth, currentCanvasHeight);

    layers.forEach(layer => {
        if (!layer.isVisible || layer.strokes.length === 0) return;
        
        targetCtx.save(); 
        targetCtx.globalAlpha = layer.opacity; 
        targetCtx.globalCompositeOperation = 'source-over';

        const animSettings = layer.animationSettings;
        const animSpeed = parseFloat(animSettings.animationSpeed) || 1; 
        const wiggleAmp = parseFloat(animSettings.wiggleIntensity) || 0;
        const breathAmount = parseFloat(animSettings.breathingStroke) || 0;
        const shakeAmount = parseFloat(animSettings.shakeIntensity) || 0;

        layer.strokes.forEach(stroke => {
            if (!stroke.points || stroke.points.length < 1) return;
            
            targetCtx.save(); 
            
            // Apply shake effect to entire stroke
            if (shakeAmount > 0 && isAnimationPlaying) { 
                const shakeX = (Math.random() - 0.5) * shakeAmount * animSpeed; 
                const shakeY = (Math.random() - 0.5) * shakeAmount * animSpeed;
                targetCtx.translate(shakeX, shakeY);
            }
            
            // Calculate dynamic stroke size for breathing effect
            let currentDynamicSize = stroke.originalSize;
            if (breathAmount > 0 && isAnimationPlaying) {
                currentDynamicSize = stroke.originalSize + Math.sin(currentTime * 0.1 * animSpeed + stroke.birthTime) * breathAmount;
                currentDynamicSize = Math.max(1, currentDynamicSize);
            }
            
            if (stroke.tool === 'pen') {
                targetCtx.beginPath();
                
                if (stroke.points.length === 1) { 
                    // Single point - draw as circle
                    const p = stroke.points[0];
                    const radius = currentDynamicSize / 2;
                    targetCtx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                    targetCtx.fillStyle = stroke.color; 
                    targetCtx.fill();
                } else { 
                    // Multiple points - draw as path
                    for (let i = 0; i < stroke.points.length; i++) {
                        let p = { ...stroke.points[i] }; 
                        
                        // Apply wiggle effect
                        if (wiggleAmp > 0 && i > 0 && isAnimationPlaying) {
                            const prevP = stroke.points[i-1]; 
                            const dx = p.x - prevP.x; 
                            const dy = p.y - prevP.y;
                            const angle = Math.atan2(dy, dx); 
                            const normalAngle = angle + Math.PI / 2; 
                            const wiggleOffset = Math.sin(currentTime * 0.1 * animSpeed + i * 0.5 + stroke.birthTime * 0.01) * wiggleAmp;
                            p.x += Math.cos(normalAngle) * wiggleOffset; 
                            p.y += Math.sin(normalAngle) * wiggleOffset;
                        }
                        
                        if (i === 0) targetCtx.moveTo(p.x, p.y); 
                        else targetCtx.lineTo(p.x, p.y);
                    }
                    
                    targetCtx.strokeStyle = stroke.color;
                    targetCtx.lineWidth = currentDynamicSize;
                    targetCtx.lineCap = 'round'; 
                    targetCtx.lineJoin = 'round'; 
                    targetCtx.stroke();
                }
            }
            
            targetCtx.restore(); 
        });
        
        targetCtx.restore(); 
    });
}

// Export functions
async function initializeFFmpeg() {
    if (!ffmpeg) { 
        ffmpeg = createFFmpeg({ 
            log: true, 
            corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js' 
        });
    }
    if (!ffmpeg.isLoaded()) {
        loadingText.textContent = "Loading FFmpeg library (~30MB)...";
        loadingIndicator.classList.remove('hidden'); 
        await ffmpeg.load();
    }
}

async function checkAndLoadFFmpeg() {
    if (typeof SharedArrayBuffer === 'undefined') {
        let sabMessage = "<p>MP4 export uses FFmpeg.wasm, which requires <code>SharedArrayBuffer</code>.</p>" +
                         "<p>This feature is often disabled by browsers unless the page is served with specific HTTP headers (COOP & COEP).</p>";
        
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            sabMessage += "<p>A Service Worker is active, which attempts to set these headers. If <code>SharedArrayBuffer</code> is still unavailable, please try **reloading the page** (sometimes a hard refresh: Ctrl+Shift+R or Cmd+Shift+R is needed). If the issue persists, your hosting environment or browser settings might be preventing it.</p>";
        } else if ('serviceWorker' in navigator) {
            sabMessage += "<p>A Service Worker is attempting to register to enable this. This might be its first activation. Please **reload the page** and try exporting again. If MP4 export still fails, the Service Worker might not have activated correctly or your environment has restrictions.</p>";
        } else {
            sabMessage += "<p>Your browser does not support Service Workers, or support is disabled. Service Workers are used here to attempt to set the required headers on this hosting platform.</p>";
        }
        
        sabMessage += "<p>For MP4 export to work, the page needs to be served with:<br>" +
                      "<code>Cross-Origin-Opener-Policy: same-origin</code><br>" +
                      "<code>Cross-Origin-Embedder-Policy: require-corp</code></p>";
        
        showModal("MP4 Export Prerequisite Missing", sabMessage);
        return false;
    }
    
    try { 
        await initializeFFmpeg(); 
    } catch (err) { 
        console.error("FFmpeg load error:", err); 
        showModal("FFmpeg Load Error", "Failed to load FFmpeg components. MP4 export is unavailable. Error: " + err.message); 
        loadingIndicator.classList.add('hidden'); 
        return false; 
    }
    
    return true;
}

// Save/Load functions
function saveProject() {
    if (layers.length === 0 || layers.every(l => l.strokes.length === 0)) { 
        showModal("Save Sketch", "Canvas empty."); 
        return; 
    }
    
    const dataToSave = { 
        layers: layers, 
        activeLayerId: activeLayerId, 
        WORLD_WIDTH, 
        WORLD_HEIGHT, 
        viewTransform 
    }; 
    
    const jsonData = JSON.stringify(dataToSave); 
    const blob = new Blob([jsonData], { type: 'application/octet-stream' }); 
    const url = URL.createObjectURL(blob); 
    const a = document.createElement('a'); 
    a.href = url;
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-'); 
    a.download = `drawerz_sketch_${timestamp}.drz`;
    
    document.body.appendChild(a); 
    a.click(); 
    document.body.removeChild(a); 
    URL.revokeObjectURL(url);
    
    showModal("Save Sketch", "Sketch saved as .drz file!");
}

function loadProject(file) {
    if (!file) return;
    
    const fileName = file.name.toLowerCase(); 
    const fileExtension = fileName.split('.').pop();
    
    if (fileExtension === 'drz') {
        loadingIndicator.classList.remove('hidden'); 
        if(loadingText) loadingText.textContent = "Loading .drz sketch...";
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.layers && Array.isArray(data.layers)) {
                    saveStateForUndo(); 
                    
                    layers = data.layers.map(loadedLayer => {
                        const defaultAnim = {};
                        for (const key in animationSliders) {
                            defaultAnim[key] = parseFloat(animationSliders[key].slider.defaultValue || 0);
                        }
                        
                        return createNewLayer(
                            loadedLayer.name || 'Loaded Layer',
                            loadedLayer.strokes || [],
                            { ...defaultAnim, ...(loadedLayer.animationSettings || {}) },
                            loadedLayer.isVisible !== undefined ? loadedLayer.isVisible : true,
                            loadedLayer.opacity !== undefined ? loadedLayer.opacity : 1
                        );
                    });
                    
                    if (data.activeLayerId && layers.find(l => l.id === data.activeLayerId)) {
                        activeLayerId = data.activeLayerId;
                    } else if (layers.length > 0) {
                        activeLayerId = layers[layers.length - 1].id;
                    } else {
                        activeLayerId = null;
                    }
                    
                    layers.forEach(l => l.isActive = (l.id === activeLayerId));
                    renderLayersList(); 
                    updateAnimationSlidersForActiveLayer(); 
                    setupCanvasDimensions();
                    showModal("Load Sketch", "Sketch loaded!");
                } else {
                    showModal("Load Error", "Invalid .drz file. Missing 'layers' data.");
                }
            } catch (error) { 
                console.error("Load error:", error); 
                showModal("Load Error", "Could not load sketch. " + error.message);
            } finally { 
                loadingIndicator.classList.add('hidden'); 
                loadInput.value = ''; 
            }
        };
        
        reader.onerror = () => { 
            showModal("Load Error", "Error reading file."); 
            loadingIndicator.classList.add('hidden'); 
            loadInput.value = ''; 
        };
        
        reader.readAsText(file);
    } else {
        showModal("Unsupported File", "Please load a .drz file."); 
        loadInput.value = ''; 
    }
}

// Event listeners
window.addEventListener('resize', setupCanvasDimensions);

controlPanelToggle.addEventListener('click', () => {
    controlPanel.classList.toggle('open');
    controlPanelToggle.innerHTML = controlPanel.classList.contains('open') ? 
        '<i class="fas fa-times"></i>' : '<i class="fas fa-bars"></i>';
});

if (canvasContainer) {
    canvasContainer.addEventListener('click', (event) => {
        if (controlPanel.classList.contains('open') && window.innerWidth <= 900) {
            if (event.target === canvasContainer || event.target === canvas) {
                controlPanel.classList.remove('open');
                controlPanelToggle.innerHTML = '<i class="fas fa-bars"></i>';
            }
        }
    });
}

// Drawing event listeners
canvas.addEventListener('pointerdown', handlePointerDown);
canvas.addEventListener('pointermove', handlePointerMove);
canvas.addEventListener('pointerup', handlePointerUp);
canvas.addEventListener('pointerleave', handlePointerUp);
canvas.addEventListener('pointercancel', handlePointerUp);

// Tool event listeners
penToolBtn.addEventListener('click', () => { 
    currentTool = 'pen'; 
    setActiveToolButton(penToolBtn); 
});

eraserToolBtn.addEventListener('click', () => { 
    currentTool = 'eraser'; 
    setActiveToolButton(eraserToolBtn); 
});

strokeSizeSlider.addEventListener('input', (e) => { 
    currentStrokeSize = parseInt(e.target.value); 
    strokeSizeValue.textContent = currentStrokeSize; 
    updateCanvasCursor(); 
});

strokeColorPicker.addEventListener('input', (e) => { 
    currentStrokeColor = e.target.value; 
});

// Animation control
globalAnimationToggle.addEventListener('click', toggleAnimation);

// Layer controls
addLayerBtn.addEventListener('click', addLayer);

layerOpacitySlider.addEventListener('input', (e) => {
    const activeLayer = getActiveLayer();
    if (activeLayer) {
        activeLayer.opacity = parseFloat(e.target.value) / 100;
        layerOpacityValue.textContent = e.target.value;
        drawScene(); 
    }
});

// Animation sliders
Object.values(animationSliders).forEach(item => {
    item.slider.addEventListener('input', (e) => {
        const activeLayer = getActiveLayer();
        if (activeLayer) {
            const key = Object.keys(animationSliders).find(k => animationSliders[k].slider === e.target);
            if (key) {
                saveStateForUndo();
                activeLayer.animationSettings[key] = parseFloat(e.target.value);
                item.valueEl.textContent = e.target.value + (item.suffix || '');
            }
        }
    });
});

// Clear buttons
clearActiveLayerBtn.addEventListener('click', () => { 
    const activeLayer = getActiveLayer();
    if (!activeLayer || activeLayer.strokes.length === 0) { 
        showModal("Clear Layer", "Active layer is already empty."); 
        return; 
    }
    
    showModal("Confirm Clear Layer", `Clear all strokes from layer "${activeLayer.name}"?`,
    [
        {
            text: "Clear Layer", 
            class: 'btn-danger', 
            action: () => { 
                saveStateForUndo(); 
                activeLayer.strokes = []; 
                drawScene(); 
                closeModal(messageModal); 
            }
        },
        {
            text: "Cancel", 
            class: 'btn', 
            action: () => closeModal(messageModal)
        }
    ], true);
});

clearAllLayersBtn.addEventListener('click', () => {
    if (layers.every(l => l.strokes.length === 0)) { 
        showModal("Clear All Layers", "All layers are already empty."); 
        return; 
    }
    
    showModal("Confirm Clear All", "Clear strokes from ALL layers?",
    [
        {
            text: "Clear All", 
            class: 'btn-danger', 
            action: () => { 
                saveStateForUndo(); 
                layers.forEach(layer => layer.strokes = []); 
                drawScene(); 
                closeModal(messageModal); 
            }
        },
        {
            text: "Cancel", 
            class: 'btn', 
            action: () => closeModal(messageModal)
        }
    ], true);
});

// Undo/Redo
undoBtn.addEventListener('click', () => {
    if (undoStack.length > 0) {
        redoStack.push({ 
            layers: JSON.parse(JSON.stringify(layers)), 
            activeLayerId: activeLayerId, 
            viewTransform: { ...viewTransform } 
        });
        
        const prevState = undoStack.pop();
        layers = prevState.layers;
        activeLayerId = prevState.activeLayerId;
        layers.forEach(l => l.isActive = (l.id === activeLayerId));
        
        renderLayersList(); 
        updateAnimationSlidersForActiveLayer(); 
        drawScene(); 
        updateUndoRedoButtons();
    }
});

redoBtn.addEventListener('click', () => {
    if (redoStack.length > 0) {
        undoStack.push({ 
            layers: JSON.parse(JSON.stringify(layers)), 
            activeLayerId: activeLayerId, 
            viewTransform: { ...viewTransform } 
        });
        
        const nextState = redoStack.pop();
        layers = nextState.layers;
        activeLayerId = nextState.activeLayerId;
        layers.forEach(l => l.isActive = (l.id === activeLayerId));
        
        renderLayersList(); 
        updateAnimationSlidersForActiveLayer(); 
        drawScene(); 
        updateUndoRedoButtons();
    }
});

// Save/Load
saveBtn.addEventListener('click', saveProject);
loadInput.addEventListener('change', (e) => loadProject(e.target.files[0]));

// Export functions (simplified for now)
exportMp4Btn.addEventListener('click', async () => {
    showModal("Export Info", "MP4 export requires animation to be playing. Start animation first, then export.");
});

exportGifBtn.addEventListener('click', async () => {
    showModal("Export Info", "GIF export requires animation to be playing. Start animation first, then export.");
});

// Modal event listeners
messageModal.addEventListener('click', (event) => { 
    if (event.target === messageModal || event.target.classList.contains('modal-button')) { 
        if (!event.target.classList.contains('btn-danger') && 
            !event.target.classList.contains('btn-primary') && 
            event.target.textContent !== 'Delete' && 
            event.target.textContent !== 'Clear Layer' && 
            event.target.textContent !== 'Clear All') {
            closeModal(messageModal);
        }
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    const activeEl = document.activeElement;
    const isInputFocused = (activeEl && 
        (activeEl.tagName.toLowerCase() === 'input' && activeEl.type !== 'range') || 
        activeEl.tagName.toLowerCase() === 'textarea');
    
    if (isInputFocused) return; 
    
    let prevented = true; 
    
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        saveBtn.click();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        loadInput.click();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        exportMp4Btn.click();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Delete') { 
        clearAllLayersBtn.click(); 
    } else if ((e.ctrlKey || e.metaKey) && e.code === 'Delete') { 
        clearActiveLayerBtn.click(); 
    } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { 
        undoBtn.click(); 
    } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { 
        redoBtn.click(); 
    } else if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey) {
        penToolBtn.click();
    } else if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey) {
        eraserToolBtn.click();
    } else if (e.code === 'Space' && !e.ctrlKey && !e.metaKey) {
        globalAnimationToggle.click();
    } else {
        prevented = false;
    }
    
    if (prevented) e.preventDefault();
});

// Service Worker registration
function initializeApp() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js', { scope: './' }) 
            .then(registration => {
                console.log('Drawerz Service Worker: Registered with scope:', registration.scope);
            }).catch(error => {
                console.error('Drawerz Service Worker: Registration failed:', error);
            });
        });
    }
    
    // Initialize UI
    loadingIndicator.classList.add('hidden'); 
    messageModal.classList.add('hidden');
    setActiveToolButton(penToolBtn); 
    strokeSizeValue.textContent = strokeSizeSlider.value;
    
    // Create initial layer if none exist
    if (layers.length === 0) { 
        const initialLayer = createNewLayer(1); 
        layers.push(initialLayer); 
        setActiveLayer(initialLayer.id); 
    } else {
        setActiveLayer(layers.find(l => l.isActive)?.id || (layers.length > 0 ? layers[0].id : null)); 
    }
    
    setupCanvasDimensions();
    updateAnimationSlidersForActiveLayer(); 
    updateUndoRedoButtons(); 
    updateCanvasCursor();
    
    // Start with a static scene
    drawScene();
}

// Initialize the application
initializeApp();