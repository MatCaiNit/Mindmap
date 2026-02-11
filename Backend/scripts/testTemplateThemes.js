// Backend/scripts/testTemplateThemes.js
// Test script to verify themes are applied correctly

import * as Y from 'yjs';
import { applyTemplateToYDoc } from '../utils/templateToYjs.js';

// Sample templates with different themes
const testTemplates = [
  {
    id: 'test-modern',
    name: 'Test Modern',
    theme: 'modern',
    color: '#3b82f6',
    structure: {
      text: 'Modern Theme Root',
      children: [
        { text: 'Branch 1', children: [{ text: 'Leaf 1.1' }] },
        { text: 'Branch 2', children: [{ text: 'Leaf 2.1' }] }
      ]
    }
  },
  {
    id: 'test-sketch',
    name: 'Test Sketch',
    theme: 'sketch',
    color: '#fbbf24',
    structure: {
      text: 'Sketch Theme Root',
      children: [
        { text: 'Branch 1', children: [{ text: 'Leaf 1.1' }] },
        { text: 'Branch 2', children: [{ text: 'Leaf 2.1' }] }
      ]
    }
  },
  {
    id: 'test-neon',
    name: 'Test Neon',
    theme: 'neon',
    color: '#00ffff',
    structure: {
      text: 'Neon Theme Root',
      children: [
        { text: 'Branch 1', children: [{ text: 'Leaf 1.1' }] },
        { text: 'Branch 2', children: [{ text: 'Leaf 2.1' }] }
      ]
    }
  }
];

function testTemplate(template) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TESTING: ${template.name} (${template.theme})`);
  console.log('='.repeat(60));
  
  const buffer = applyTemplateToYDoc(template);
  
  if (!buffer) {
    console.error('❌ FAILED: No buffer returned');
    return false;
  }
  
  // Decode and verify
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, new Uint8Array(buffer));
  
  const yNodes = ydoc.getMap('nodes');
  const yEdges = ydoc.getArray('edges');
  
  console.log('\n📊 VERIFICATION:');
  console.log('   Nodes created:', yNodes.size);
  console.log('   Edges created:', yEdges.length);
  
  // Check root node
  const root = yNodes.get('root-node');
  if (!root) {
    console.error('❌ FAILED: Root node not found');
    return false;
  }
  
  console.log('\n🔍 ROOT NODE INSPECTION:');
  console.log('   Label:', root.label);
  console.log('   Theme:', root.theme);
  console.log('   Color:', root.color);
  console.log('   TextColor:', root.textColor);
  console.log('   FontSize:', root.fontSize);
  console.log('   BorderRadius:', root.borderRadius);
  console.log('   FontWeight:', root.fontWeight);
  
  // Verify theme is applied
  if (root.theme !== template.theme) {
    console.error(`❌ FAILED: Theme mismatch (expected ${template.theme}, got ${root.theme})`);
    return false;
  }
  
  // Check first child
  let firstChild = null;
  yNodes.forEach((node, id) => {
    if (!firstChild && node.parentId === 'root-node') {
      firstChild = { id, ...node };
    }
  });
  
  if (firstChild) {
    console.log('\n🔍 FIRST CHILD INSPECTION:');
    console.log('   Label:', firstChild.label);
    console.log('   Theme:', firstChild.theme);
    console.log('   Color:', firstChild.color);
    console.log('   FontSize:', firstChild.fontSize);
    console.log('   BorderRadius:', firstChild.borderRadius);
    
    if (firstChild.theme !== template.theme) {
      console.error(`❌ FAILED: Child theme mismatch`);
      return false;
    }
  }
  
  console.log('\n✅ TEST PASSED');
  return true;
}

// Run tests
console.log('\n🧪 THEME APPLICATION TEST SUITE');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

testTemplates.forEach(template => {
  try {
    if (testTemplate(template)) {
      passed++;
    } else {
      failed++;
    }
  } catch (err) {
    console.error(`❌ ERROR: ${err.message}`);
    failed++;
  }
});

console.log('\n' + '='.repeat(60));
console.log('📊 TEST RESULTS');
console.log('='.repeat(60));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📊 Total: ${passed + failed}`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);