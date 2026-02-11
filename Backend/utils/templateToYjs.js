// Backend/utils/templateToYjs.js
// UPDATED: Add metadata flag for auto-layout trigger

const Y = require('yjs');

// Theme configurations with distinct visual styles
const THEME_CONFIGS = {
  modern: {
    name: '✨ Modern',
    colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'],
    root: {
      fontSize: '20px',
      fontWeight: '600',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      borderRadius: '12px',
      border: '2px solid rgba(59, 130, 246, 0.3)',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      padding: '16px 24px',
      textColor: '#FFFFFF'
    },
    level1: {
      fontSize: '16px',
      fontWeight: '500',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      borderRadius: '8px',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.08)',
      padding: '12px 18px',
      textColor: '#FFFFFF'
    },
    level2: {
      fontSize: '14px',
      fontWeight: '400',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      borderRadius: '6px',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
      padding: '8px 14px',
      textColor: '#FFFFFF'
    },
    edgeStyle: {
      strokeWidth: 2,
      stroke: '#94A3B8'
    }
  },
  
  sketch: {
    name: '✏️ Sketch',
    colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'],
    root: {
      fontSize: '22px',
      fontWeight: '700',
      fontFamily: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive',
      borderRadius: '15px',
      border: '3px dashed #1E293B',
      boxShadow: '4px 4px 0px rgba(0, 0, 0, 0.15)',
      padding: '18px 28px',
      textColor: '#1E293B',
      transform: 'rotate(-2deg)'
    },
    level1: {
      fontSize: '17px',
      fontWeight: '600',
      fontFamily: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive',
      borderRadius: '12px',
      border: '2px dashed #334155',
      boxShadow: '3px 3px 0px rgba(0, 0, 0, 0.12)',
      padding: '14px 20px',
      textColor: '#1E293B',
      transform: 'rotate(1deg)'
    },
    level2: {
      fontSize: '15px',
      fontWeight: '500',
      fontFamily: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive',
      borderRadius: '10px',
      border: '2px dashed #475569',
      boxShadow: '2px 2px 0px rgba(0, 0, 0, 0.1)',
      padding: '10px 16px',
      textColor: '#1E293B',
      transform: 'rotate(-0.5deg)'
    },
    edgeStyle: {
      strokeWidth: 2,
      strokeDasharray: '8 4',
      stroke: '#64748B'
    }
  },
  
  cartoon: {
    name: '🎨 Cartoon',
    colors: ['#FF6B9D', '#4ECDC4', '#FFD93D', '#6BCF7F', '#C77DFF', '#FF8C42', '#00D9FF'],
    root: {
      fontSize: '24px',
      fontWeight: '900',
      fontFamily: '"Fredoka One", "Baloo 2", "Quicksand", cursive',
      borderRadius: '20px',
      border: '5px solid #1A1A2E',
      boxShadow: '6px 6px 0px #1A1A2E',
      padding: '20px 32px',
      textColor: '#1A1A2E'
    },
    level1: {
      fontSize: '19px',
      fontWeight: '800',
      fontFamily: '"Fredoka One", "Baloo 2", "Quicksand", cursive',
      borderRadius: '16px',
      border: '4px solid #1A1A2E',
      boxShadow: '4px 4px 0px #1A1A2E',
      padding: '16px 24px',
      textColor: '#1A1A2E'
    },
    level2: {
      fontSize: '16px',
      fontWeight: '700',
      fontFamily: '"Fredoka One", "Baloo 2", "Quicksand", cursive',
      borderRadius: '12px',
      border: '3px solid #1A1A2E',
      boxShadow: '3px 3px 0px #1A1A2E',
      padding: '12px 18px',
      textColor: '#1A1A2E'
    },
    edgeStyle: {
      strokeWidth: 4,
      stroke: '#1A1A2E'
    }
  },
  
  circuit: {
    name: '⚡ Circuit',
    colors: ['#00F5FF', '#39FF14', '#FF10F0', '#FFD700', '#FF6EC7', '#00FFFF', '#FFA500'],
    root: {
      fontSize: '20px',
      fontWeight: '600',
      fontFamily: '"Courier New", "Consolas", "Monaco", monospace',
      borderRadius: '4px',
      border: '2px solid #00F5FF',
      boxShadow: '0 0 20px rgba(0, 245, 255, 0.6), inset 0 0 10px rgba(0, 245, 255, 0.2)',
      padding: '16px 24px',
      textColor: '#00F5FF',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)'
    },
    level1: {
      fontSize: '16px',
      fontWeight: '500',
      fontFamily: '"Courier New", "Consolas", "Monaco", monospace',
      borderRadius: '3px',
      border: '1px solid currentColor',
      boxShadow: '0 0 15px currentColor, inset 0 0 8px rgba(255, 255, 255, 0.1)',
      padding: '12px 18px',
      textColor: '#FFFFFF',
      background: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)'
    },
    level2: {
      fontSize: '14px',
      fontWeight: '400',
      fontFamily: '"Courier New", "Consolas", "Monaco", monospace',
      borderRadius: '2px',
      border: '1px solid currentColor',
      boxShadow: '0 0 10px currentColor',
      padding: '8px 14px',
      textColor: '#FFFFFF',
      background: 'linear-gradient(135deg, #334155 0%, #475569 100%)'
    },
    edgeStyle: {
      strokeWidth: 2,
      stroke: '#00F5FF'
    }
  },
  
  blueprint: {
    name: '📐 Blueprint',
    colors: ['#60A5FA', '#34D399', '#FBBF24', '#F87171', '#A78BFA', '#FB7185', '#2DD4BF'],
    root: {
      fontSize: '20px',
      fontWeight: '700',
      fontFamily: '"Courier Prime", "Courier New", monospace',
      borderRadius: '0px',
      border: '3px double #FFFFFF',
      boxShadow: 'none',
      padding: '16px 24px',
      textColor: '#FFFFFF',
      letterSpacing: '0.5px'
    },
    level1: {
      fontSize: '16px',
      fontWeight: '600',
      fontFamily: '"Courier Prime", "Courier New", monospace',
      borderRadius: '0px',
      border: '2px solid #FFFFFF',
      boxShadow: 'none',
      padding: '12px 18px',
      textColor: '#FFFFFF',
      letterSpacing: '0.3px'
    },
    level2: {
      fontSize: '14px',
      fontWeight: '500',
      fontFamily: '"Courier Prime", "Courier New", monospace',
      borderRadius: '0px',
      border: '1px solid #FFFFFF',
      boxShadow: 'none',
      padding: '8px 14px',
      textColor: '#FFFFFF',
      letterSpacing: '0.2px'
    },
    edgeStyle: {
      strokeWidth: 1,
      strokeDasharray: '4 2',
      stroke: '#FFFFFF'
    }
  },
  
  fluid: {
    name: '🌊 Fluid',
    colors: [
      'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
      'linear-gradient(135deg, #F093FB 0%, #F5576C 100%)',
      'linear-gradient(135deg, #4FACFE 0%, #00F2FE 100%)',
      'linear-gradient(135deg, #43E97B 0%, #38F9D7 100%)',
      'linear-gradient(135deg, #FA709A 0%, #FEE140 100%)',
      'linear-gradient(135deg, #30CFD0 0%, #330867 100%)',
      'linear-gradient(135deg, #A8EDEA 0%, #FED6E3 100%)'
    ],
    root: {
      fontSize: '20px',
      fontWeight: '600',
      fontFamily: '"Quicksand", "Nunito", "Poppins", sans-serif',
      borderRadius: '50% 40% 60% 50%',
      border: 'none',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
      padding: '18px 28px',
      textColor: '#FFFFFF',
      filter: 'url(#goo)'
    },
    level1: {
      fontSize: '16px',
      fontWeight: '500',
      fontFamily: '"Quicksand", "Nunito", "Poppins", sans-serif',
      borderRadius: '40% 50% 45% 55%',
      border: 'none',
      boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12)',
      padding: '14px 20px',
      textColor: '#FFFFFF',
      filter: 'url(#goo)'
    },
    level2: {
      fontSize: '14px',
      fontWeight: '400',
      fontFamily: '"Quicksand", "Nunito", "Poppins", sans-serif',
      borderRadius: '45% 55% 50% 50%',
      border: 'none',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
      padding: '10px 16px',
      textColor: '#FFFFFF',
      filter: 'url(#goo)'
    },
    edgeStyle: {
      strokeWidth: 3,
      stroke: '#A78BFA'
    }
  },
  
  vintage: {
    name: '📜 Vintage',
    colors: [
      'linear-gradient(135deg, #8B4513 0%, #D2691E 100%)',
      'linear-gradient(135deg, #CD853F 0%, #DEB887 100%)',
      'linear-gradient(135deg, #A0522D 0%, #CD853F 100%)',
      'linear-gradient(135deg, #D2691E 0%, #F4A460 100%)',
      'linear-gradient(135deg, #8B7355 0%, #A0826D 100%)',
      'linear-gradient(135deg, #C19A6B 0%, #D4AF37 100%)',
      'linear-gradient(135deg, #B8860B 0%, #DAA520 100%)'
    ],
    root: {
      fontSize: '22px',
      fontWeight: '700',
      fontFamily: '"Playfair Display", "Times New Roman", serif',
      borderRadius: '8px',
      border: '4px double #4A4A4A',
      boxShadow: '0 6px 12px rgba(0, 0, 0, 0.3), inset 0 2px 4px rgba(255, 255, 255, 0.2)',
      padding: '18px 28px',
      textColor: '#2C2C2C',
      letterSpacing: '0.5px'
    },
    level1: {
      fontSize: '17px',
      fontWeight: '600',
      fontFamily: '"Playfair Display", "Times New Roman", serif',
      borderRadius: '6px',
      border: '3px double #5A5A5A',
      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.25), inset 0 1px 3px rgba(255, 255, 255, 0.15)',
      padding: '14px 22px',
      textColor: '#2C2C2C',
      letterSpacing: '0.3px'
    },
    level2: {
      fontSize: '15px',
      fontWeight: '500',
      fontFamily: '"Playfair Display", "Times New Roman", serif',
      borderRadius: '4px',
      border: '2px solid #6A6A6A',
      boxShadow: '0 3px 6px rgba(0, 0, 0, 0.2)',
      padding: '10px 16px',
      textColor: '#2C2C2C',
      letterSpacing: '0.2px'
    },
    edgeStyle: {
      strokeWidth: 2,
      stroke: '#8B7355'
    }
  }
};

/**
 * Apply template structure to Y.Doc
 * @param {Object} template - Template object with structure and theme
 * @returns {Buffer} Encoded Y.Doc as Buffer
 */
function applyTemplateToYDoc(template) {
  const ydoc = new Y.Doc();
  const yNodes = ydoc.getMap('nodes');
  const yEdges = ydoc.getMap('edges');
  const yMetadata = ydoc.getMap('metadata');

  // Get theme config
  const themeConfig = THEME_CONFIGS[template.theme] || THEME_CONFIGS.modern;
  console.log(`🎨 Applying theme: ${themeConfig.name}`);

  // Add metadata flag for auto-layout trigger
  yMetadata.set('createdFromTemplate', true);
  yMetadata.set('templateId', template.id);
  yMetadata.set('templateName', template.name);
  yMetadata.set('theme', template.theme);
  yMetadata.set('createdAt', new Date().toISOString());

  // Create root node
  const rootId = 'node-root';
  const rootNode = {
    label: template.structure.label,
    position: { x: 0, y: 0 }, // Will be auto-arranged
    ...themeConfig.root,
    backgroundColor: themeConfig.colors[0],
    isRoot: true,
    themeMetadata: {
      themeName: template.theme,
      ...themeConfig
    }
  };
  yNodes.set(rootId, rootNode);

  // Process children recursively
  if (template.structure.children) {
    processChildren(
      template.structure.children,
      rootId,
      yNodes,
      yEdges,
      themeConfig,
      1 // level
    );
  }

  // Encode to buffer
  const update = Y.encodeStateAsUpdate(ydoc);
  return Buffer.from(update);
}

/**
 * Process children nodes recursively
 */
function processChildren(children, parentId, yNodes, yEdges, themeConfig, level) {
  children.forEach((child, index) => {
    const nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Determine style based on level
    const levelKey = level === 1 ? 'level1' : 'level2';
    const levelStyle = themeConfig[levelKey];
    
    // Cycle through colors
    const colorIndex = index % themeConfig.colors.length;
    const backgroundColor = themeConfig.colors[colorIndex];

    // Create node
    const node = {
      label: child.label,
      position: { x: 0, y: 0 }, // Will be auto-arranged
      ...levelStyle,
      backgroundColor,
      isRoot: false,
      themeMetadata: {
        themeName: themeConfig.name,
        ...themeConfig
      }
    };
    yNodes.set(nodeId, node);

    // Create edge
    const edgeId = `e${parentId}-${nodeId}`;
    yEdges.set(edgeId, {
      source: parentId,
      target: nodeId,
      animated: false,
      style: themeConfig.edgeStyle
    });

    // Recursively process grandchildren
    if (child.children && child.children.length > 0) {
      processChildren(child.children, nodeId, yNodes, yEdges, themeConfig, level + 1);
    }
  });
}

module.exports = {
  applyTemplateToYDoc,
  THEME_CONFIGS
};