// Frontend/src/data/mindmapThemes-DISTINCT.js
// 5 TRULY DISTINCT THEMES - Not just color changes!

export const MINDMAP_THEMES = {
  
  // 1. 🎨 HAND-DRAWN / SKETCH (Vẽ tay thực sự)
  sketch: {
    id: 'sketch',
    name: 'Hand-Drawn Sketch',
    description: 'Rough, artistic, hand-drawn look',
    
    root: {
      shape: 'custom-sketch-blob',
      fontSize: '24px',
      fontWeight: 'bold',
      fontFamily: '"Comic Sans MS", "Marker Felt", cursive',
      backgroundColor: '#fef3c7',
      textColor: '#1f2937',
      
      // Custom SVG path for hand-drawn blob
      svgPath: 'M 10,50 Q 5,25 30,15 T 70,10 Q 95,15 100,40 T 95,80 Q 80,95 50,90 T 15,75 Q 5,60 10,50',
      strokeWidth: 3,
      stroke: '#1f2937',
      strokeStyle: 'rough', // Rough.js style
      roughness: 2.5,
      fill: '#fef3c7',
      fillStyle: 'hachure',
      
      // Add sketchy effects
      filter: 'url(#sketch-filter)',
      transform: 'rotate(-2deg)',
    },
    
    level1: {
      shape: 'custom-sketch-rect',
      fontSize: '18px',
      fontWeight: '600',
      fontFamily: '"Comic Sans MS", cursive',
      
      // Irregular rectangle
      svgPath: 'M 5,5 L 95,8 L 97,92 L 3,95 Z',
      strokeWidth: 2.5,
      stroke: '#1f2937',
      strokeStyle: 'rough',
      roughness: 2,
      fill: '#fef3c7',
      fillStyle: 'cross-hatch',
      
      transform: 'rotate(1deg)',
    },
    
    level2: {
      shape: 'custom-sketch-ellipse',
      fontSize: '15px',
      fontWeight: '500',
      
      svgPath: 'M 50,10 A 40,20 0 1,0 50,90 A 40,20 0 1,0 50,10',
      strokeWidth: 2,
      strokeStyle: 'rough',
      roughness: 1.5,
      fill: '#fef3c7',
      
      transform: 'rotate(-0.5deg)',
    },
    
    edge: {
      type: 'custom-sketch-line',
      renderStyle: 'rough', // Use Rough.js
      strokeWidth: 2,
      stroke: '#1f2937',
      roughness: 2,
      bowing: 3, // How much the line curves
      
      // Hand-drawn arrow
      markerEnd: 'rough-arrow',
    },
    
    colors: ['#fbbf24', '#f87171', '#34d399', '#a78bfa'],
    
    // Custom filters for sketch effect
    filters: {
      sketch: `
        <filter id="sketch-filter">
          <feTurbulence baseFrequency="0.02" numOctaves="3" result="noise"/>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3"/>
        </filter>
      `
    }
  },

  // 2. ⚡ CIRCUIT BOARD / TECH (Mạch điện)
  circuit: {
    id: 'circuit',
    name: 'Circuit Board',
    description: 'Electronic circuit style with digital elements',
    
    root: {
      shape: 'custom-chip',
      fontSize: '16px',
      fontWeight: 'bold',
      fontFamily: 'monospace',
      
      // Microchip shape with pins
      svgElement: 'chip', // Custom SVG component
      backgroundColor: '#1a1a2e',
      textColor: '#00ff00',
      
      // Chip outline
      chipStyle: {
        body: { fill: '#1a1a2e', stroke: '#00ff00', strokeWidth: 2 },
        pins: { count: 8, width: 4, height: 8, fill: '#00ff00' },
        notch: true, // Top notch for orientation
      },
      
      // LED indicator
      led: {
        color: '#00ff00',
        blinking: true,
        position: 'top-right',
      },
      
      boxShadow: '0 0 20px #00ff00',
    },
    
    level1: {
      shape: 'custom-resistor',
      fontSize: '14px',
      fontFamily: 'monospace',
      
      // Resistor symbol
      svgElement: 'resistor',
      backgroundColor: '#16213e',
      textColor: '#00ffff',
      
      resistorStyle: {
        body: { fill: '#d4a574', stroke: '#000', strokeWidth: 1 },
        bands: ['#ff0000', '#ff0000', '#ff6600'], // Color code
        leads: { stroke: '#888', strokeWidth: 2 },
      },
      
      boxShadow: '0 0 15px #00ffff',
    },
    
    level2: {
      shape: 'custom-capacitor',
      fontSize: '12px',
      fontFamily: 'monospace',
      
      // Capacitor symbol
      svgElement: 'capacitor',
      backgroundColor: '#0f3460',
      textColor: '#ffd700',
      
      capacitorStyle: {
        plates: { fill: '#888', width: 20, gap: 4 },
        leads: { stroke: '#888', strokeWidth: 2 },
      },
      
      boxShadow: '0 0 10px #ffd700',
    },
    
    edge: {
      type: 'custom-circuit-trace',
      renderStyle: 'pcb-trace', // PCB copper trace style
      
      // Right-angle routing like circuit boards
      routing: 'orthogonal',
      strokeWidth: 3,
      stroke: '#00ff00',
      
      // Solder points at connections
      connectionMarker: 'solder-point',
      
      // Animated electrons
      animated: true,
      electronSpeed: 2,
      electronColor: '#ffff00',
      electronSize: 4,
      
      // Via (through-hole) at intersections
      viaStyle: {
        radius: 4,
        fill: '#888',
        stroke: '#00ff00',
        strokeWidth: 1,
      },
    },
    
    colors: ['#00ff00', '#00ffff', '#ffff00', '#ff00ff'],
    
    // Background grid like PCB
    background: {
      type: 'pcb-grid',
      gridColor: '#0a3d1f',
      gridSize: 20,
    }
  },

  // 3. 🎬 ANIMATED / CARTOON (Hoạt hình Disney)
  cartoon: {
    id: 'cartoon',
    name: 'Animated Cartoon',
    description: 'Bouncy, fun, Disney-style animation',
    
    root: {
      shape: 'custom-cartoon-cloud',
      fontSize: '24px',
      fontWeight: 'bold',
      fontFamily: '"Fredoka One", "Baloo", cursive',
      
      // Cartoon cloud with bouncy outline
      svgElement: 'cartoon-cloud',
      backgroundColor: '#ffffff',
      textColor: '#ff1744',
      
      cloudStyle: {
        bubbles: [
          { cx: 20, cy: 50, r: 18 },
          { cx: 45, cy: 30, r: 25 },
          { cx: 70, cy: 35, r: 22 },
          { cx: 85, cy: 55, r: 20 },
        ],
        fill: '#ffffff',
        stroke: '#000000',
        strokeWidth: 4,
      },
      
      // Thick cartoon outline
      outline: {
        stroke: '#000000',
        strokeWidth: 4,
        strokeLinejoin: 'round',
        strokeLinecap: 'round',
      },
      
      // Bounce animation on hover
      animation: {
        idle: 'bounce 2s ease-in-out infinite',
        hover: 'squash 0.3s ease-out',
      },
      
      // Drop shadow for depth
      dropShadow: '4px 4px 0px rgba(0,0,0,0.3)',
    },
    
    level1: {
      shape: 'custom-cartoon-speech-bubble',
      fontSize: '18px',
      fontFamily: '"Fredoka One", cursive',
      
      // Speech bubble with tail
      svgElement: 'speech-bubble',
      backgroundColor: '#ffeb3b',
      textColor: '#000000',
      
      bubbleStyle: {
        body: { 
          rx: 20, 
          ry: 20,
          fill: '#ffeb3b',
          stroke: '#000000',
          strokeWidth: 4,
        },
        tail: {
          points: 'M 50,90 L 40,110 L 60,95',
          fill: '#ffeb3b',
          stroke: '#000000',
          strokeWidth: 4,
        },
      },
      
      animation: {
        idle: 'wiggle 3s ease-in-out infinite',
        hover: 'pop 0.2s ease-out',
      },
      
      dropShadow: '3px 3px 0px rgba(0,0,0,0.25)',
    },
    
    level2: {
      shape: 'custom-cartoon-star',
      fontSize: '15px',
      
      // Cartoon star burst
      svgElement: 'star-burst',
      backgroundColor: '#ff4081',
      textColor: '#ffffff',
      
      starStyle: {
        points: 8,
        outerRadius: 30,
        innerRadius: 15,
        fill: '#ff4081',
        stroke: '#000000',
        strokeWidth: 3,
      },
      
      // Sparkle effect
      sparkles: {
        count: 3,
        color: '#ffffff',
        animation: 'twinkle',
      },
      
      animation: {
        idle: 'rotate 10s linear infinite',
        hover: 'pulse 0.5s ease-out',
      },
      
      dropShadow: '2px 2px 0px rgba(0,0,0,0.2)',
    },
    
    edge: {
      type: 'custom-cartoon-line',
      renderStyle: 'bouncy',
      
      // Thick, smooth bezier with overshoot
      strokeWidth: 6,
      stroke: '#000000',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      
      // Exaggerated curve
      curvature: 0.7,
      
      // Animated motion path
      animated: true,
      animationStyle: 'dash-chase',
      
      // Cartoon arrow
      markerEnd: 'cartoon-arrow',
      arrowStyle: {
        fill: '#000000',
        size: 20,
        style: 'chunky',
      },
      
      // Speed lines for motion
      speedLines: {
        enabled: true,
        count: 3,
        color: 'rgba(0,0,0,0.2)',
      },
    },
    
    colors: ['#ff1744', '#ffeb3b', '#00e676', '#2979ff', '#ff4081'],
    
    // Keyframe animations
    animations: {
      bounce: `
        @keyframes bounce {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-10px) scale(1.02); }
        }
      `,
      squash: `
        @keyframes squash {
          0% { transform: scale(1, 1); }
          50% { transform: scale(1.1, 0.9); }
          100% { transform: scale(1, 1); }
        }
      `,
      wiggle: `
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-5deg); }
          75% { transform: rotate(5deg); }
        }
      `,
      pop: `
        @keyframes pop {
          0% { transform: scale(1); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
      `,
    }
  },

  // 4. 🏛️ ARCHITECTURAL / BLUEPRINT (Bản vẽ kiến trúc)
  blueprint: {
    id: 'blueprint',
    name: 'Architectural Blueprint',
    description: 'Technical drawing / architectural style',
    
    root: {
      shape: 'custom-elevation-view',
      fontSize: '14px',
      fontWeight: 'normal',
      fontFamily: '"Architects Daughter", "Courier New", monospace',
      
      // Architectural elevation drawing
      svgElement: 'elevation',
      backgroundColor: '#001935',
      textColor: '#ffffff',
      
      elevationStyle: {
        border: {
          stroke: '#ffffff',
          strokeWidth: 3,
          strokeDasharray: 'none',
        },
        title: {
          position: 'bottom',
          underline: true,
          style: 'architectural',
        },
        dimensionLines: true,
        centerLine: { stroke: '#ffffff', strokeDasharray: '5,5' },
      },
      
      // Blueprint grid background
      grid: {
        enabled: true,
        size: 10,
        color: 'rgba(255,255,255,0.1)',
        style: 'dotted',
      },
      
      // Annotation marker
      annotation: {
        number: 'A1',
        circle: true,
        position: 'top-left',
      },
    },
    
    level1: {
      shape: 'custom-detail-callout',
      fontSize: '12px',
      fontFamily: 'monospace',
      
      // Detail callout circle
      svgElement: 'callout',
      backgroundColor: 'transparent',
      textColor: '#ffffff',
      
      calloutStyle: {
        circle: {
          stroke: '#ffffff',
          strokeWidth: 2,
          fill: '#001935',
        },
        line: {
          stroke: '#ffffff',
          strokeWidth: 1,
          strokeDasharray: '3,3',
          length: 40,
        },
        label: {
          position: 'end',
          background: '#001935',
        },
      },
    },
    
    level2: {
      shape: 'custom-note-box',
      fontSize: '11px',
      fontFamily: 'monospace',
      
      // Note/specification box
      svgElement: 'note-box',
      backgroundColor: 'rgba(255,255,255,0.05)',
      textColor: '#ffffff',
      
      noteStyle: {
        border: {
          stroke: '#ffffff',
          strokeWidth: 1,
        },
        titleBar: {
          height: 20,
          fill: 'rgba(255,255,255,0.1)',
        },
        bullet: '→',
      },
    },
    
    edge: {
      type: 'custom-dimension-line',
      renderStyle: 'dimension',
      
      // Technical dimension line
      strokeWidth: 1,
      stroke: '#ffffff',
      strokeDasharray: 'none',
      
      // Extension lines
      extensionLines: {
        enabled: true,
        length: 10,
        stroke: '#ffffff',
        strokeWidth: 0.5,
      },
      
      // Dimension arrows
      arrows: {
        style: 'closed',
        size: 8,
        fill: '#ffffff',
      },
      
      // Dimension text (measurement)
      dimensionText: {
        enabled: false, // Don't show measurements
      },
    },
    
    colors: ['#ffffff', '#00d9ff', '#ff9500', '#00ff00'],
    
    // Blueprint background
    background: {
      type: 'blueprint',
      baseColor: '#001935',
      gridColor: 'rgba(255,255,255,0.05)',
      gridSize: 20,
      borderFrame: true,
    }
  },

  // 5. 🌊 ORGANIC FLOW / FLUID (Dòng chảy hữu cơ)
  fluid: {
    id: 'fluid',
    name: 'Organic Fluid Flow',
    description: 'Flowing, liquid, organic shapes',
    
    root: {
      shape: 'custom-fluid-blob',
      fontSize: '20px',
      fontWeight: '600',
      fontFamily: '"Poppins", sans-serif',
      
      // SVG filter for liquid effect
      svgElement: 'fluid-blob',
      
      blobStyle: {
        // Metaball effect
        filter: 'url(#goo-filter)',
        fill: 'url(#gradient-flow)',
        
        // Animated blob shape
        morphing: true,
        morphSpeed: 3, // seconds
        
        // Organic shape points (will morph between states)
        shapes: [
          'M 50,10 Q 80,20 90,50 T 70,90 Q 40,95 20,70 T 50,10',
          'M 50,5 Q 85,15 92,45 T 75,88 Q 45,98 18,75 T 50,5',
          'M 48,8 Q 78,18 88,48 T 72,92 Q 42,97 22,72 T 48,8',
        ],
      },
      
      // Gradient fill
      gradient: {
        type: 'radial',
        colors: ['#667eea', '#764ba2'],
        animated: true,
      },
      
      // Liquid drop shadow
      dropShadow: '0 10px 30px rgba(102, 126, 234, 0.5)',
      
      // Ripple effect on hover
      ripple: {
        enabled: true,
        color: 'rgba(255,255,255,0.3)',
      },
    },
    
    level1: {
      shape: 'custom-fluid-droplet',
      fontSize: '16px',
      
      // Water droplet shape
      svgElement: 'droplet',
      
      dropletStyle: {
        filter: 'url(#goo-filter)',
        fill: 'url(#gradient-droplet)',
        
        // Droplet path
        path: 'M 50,5 Q 70,30 70,50 Q 70,80 50,95 Q 30,80 30,50 Q 30,30 50,5',
        
        // Shine effect
        highlight: {
          cx: 45,
          cy: 25,
          rx: 10,
          ry: 15,
          fill: 'rgba(255,255,255,0.4)',
        },
      },
      
      gradient: {
        type: 'linear',
        angle: 135,
        colors: ['#4facfe', '#00f2fe'],
      },
      
      dropShadow: '0 6px 20px rgba(79, 172, 254, 0.4)',
    },
    
    level2: {
      shape: 'custom-fluid-bubble',
      fontSize: '14px',
      
      // Bubble with glossy effect
      svgElement: 'bubble',
      
      bubbleStyle: {
        fill: 'rgba(255,255,255,0.2)',
        stroke: 'rgba(255,255,255,0.6)',
        strokeWidth: 2,
        
        // Glossy highlights
        highlights: [
          { cx: '30%', cy: '30%', r: '20%', opacity: 0.6 },
          { cx: '70%', cy: '70%', r: '10%', opacity: 0.3 },
        ],
        
        // Transparency gradient
        mask: 'url(#bubble-mask)',
      },
      
      dropShadow: '0 4px 15px rgba(0,0,0,0.1)',
    },
    
    edge: {
      type: 'custom-fluid-stream',
      renderStyle: 'fluid',
      
      // Liquid flow effect
      strokeWidth: 8,
      
      // Gradient stroke
      stroke: 'url(#stream-gradient)',
      
      // Smooth organic curve
      curvature: 0.6,
      
      // Animated flow
      animated: true,
      animationStyle: 'flow',
      
      // Flow particles
      particles: {
        enabled: true,
        count: 5,
        size: 4,
        speed: 2,
        color: 'rgba(255,255,255,0.6)',
      },
      
      // Merge at connections (metaball effect)
      connectionMerge: true,
      
      // No arrow (organic flow)
      markerEnd: 'none',
    },
    
    colors: [
      '#667eea', // Purple
      '#4facfe', // Blue
      '#43e97b', // Green
      '#fa709a', // Pink
      '#30cfd0', // Cyan
    ],
    
    // SVG filters for goo/metaball effect
    filters: {
      goo: `
        <filter id="goo-filter">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur"/>
          <feColorMatrix in="blur" mode="matrix" values="
            1 0 0 0 0
            0 1 0 0 0
            0 0 1 0 0
            0 0 0 18 -7" result="goo"/>
          <feComposite in="SourceGraphic" in2="goo" operator="atop"/>
        </filter>
      `,
    },
    
    // Animated gradient
    gradientAnimation: {
      enabled: true,
      duration: 5,
      type: 'rotate',
    }
  },

  modern: {
    id: 'modern',
    name: 'Modern Clean',
    root: { shape: 'rect', fontSize: '18px' },
    level1: {},
    level2: {},
    edge: {},
    colors: ['#3b82f6'],
  },

  vintage: {
    id: 'vintage',
    name: 'Vintage Clean',
    root: { shape: 'rect', fontSize: '18px' },
    level1: {},
    level2: {},
    edge: {},
    colors: ['#3b82f6'],
  },
};

// Export helper to check if theme requires custom rendering
export function requiresCustomRendering(themeId) {
  return ['sketch', 'circuit', 'cartoon', 'blueprint', 'fluid'].includes(themeId);
}

// Export shape renderer functions
export const customShapeRenderers = {
  // Sketch: Use Rough.js
  sketch: (node, ctx) => {
    // Implementation uses rough.js library
    // Returns SVG element with rough style
  },
  
  // Circuit: Custom SVG components
  circuit: (node, ctx) => {
    // Returns chip/resistor/capacitor SVG
  },
  
  // Cartoon: Animated SVG with CSS animations
  cartoon: (node, ctx) => {
    // Returns cartoon shape with bounce/wiggle animations
  },
  
  // Blueprint: Technical drawing style
  blueprint: (node, ctx) => {
    // Returns blueprint-style box with dimensions
  },
  
  // Fluid: Morphing blob with SVG filters
  fluid: (node, ctx) => {
    // Returns animated blob with goo filter
  },
};