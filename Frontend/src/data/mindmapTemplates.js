// Frontend/src/data/mindmapTemplates.js
// 4 templates, each locked to one of the 4 distinct themes.
// Kept intentionally small so quality > quantity.

export const MINDMAP_TEMPLATES = [
  // ── 1. MODERN ──────────────────────────────────────────────────────────────
  {
    id: 'project-planning',
    name: 'Project Planning',
    description: 'Phases, tasks, resources and risks — everything a project kickoff needs.',
    icon: '📋',
    category: 'Business',
    theme: 'modern',
    structure: {
      text: 'Project Name',
      children: [
        {
          text: 'Goals',
          children: [
            { text: 'Primary goal' },
            { text: 'Success metrics' },
          ],
        },
        {
          text: 'Timeline',
          children: [
            { text: 'Phase 1' },
            { text: 'Phase 2' },
            { text: 'Milestones' },
          ],
        },
        {
          text: 'Team & Resources',
          children: [
            { text: 'Team members' },
            { text: 'Budget' },
            { text: 'Tools' },
          ],
        },
        {
          text: 'Risks',
          children: [
            { text: 'Potential risks' },
            { text: 'Contingency plans' },
          ],
        },
      ],
    },
  },

  // ── 2. SKETCH ──────────────────────────────────────────────────────────────
  {
    id: 'brainstorm',
    name: 'Brainstorm',
    description: 'Capture wild ideas freely. The hand-drawn style keeps it casual and creative.',
    icon: '💡',
    category: 'Creative',
    theme: 'sketch',
    structure: {
      text: 'Big Idea',
      children: [
        {
          text: 'Why?',
          children: [
            { text: 'Pain point' },
            { text: 'Opportunity' },
          ],
        },
        {
          text: 'How?',
          children: [
            { text: 'Approach A' },
            { text: 'Approach B' },
            { text: 'Wild card idea' },
          ],
        },
        {
          text: 'Who?',
          children: [
            { text: 'Target users' },
            { text: 'Stakeholders' },
          ],
        },
        {
          text: 'Next steps',
          children: [
            { text: 'Quick wins' },
            { text: 'Experiments to run' },
          ],
        },
      ],
    },
  },

  // ── 3. NEON ────────────────────────────────────────────────────────────────
  {
    id: 'software-architecture',
    name: 'Software Architecture',
    description: 'Map out system layers, services and infra with a cyberpunk circuit-board look.',
    icon: '⚡',
    category: 'Technology',
    theme: 'neon',
    structure: {
      text: 'System',
      children: [
        {
          text: 'Frontend',
          children: [
            { text: 'UI Components' },
            { text: 'State management' },
            { text: 'Routing' },
          ],
        },
        {
          text: 'Backend',
          children: [
            { text: 'API Gateway' },
            { text: 'Auth service' },
            { text: 'Business logic' },
          ],
        },
        {
          text: 'Data',
          children: [
            { text: 'Primary DB' },
            { text: 'Cache layer' },
            { text: 'File storage' },
          ],
        },
        {
          text: 'Infra',
          children: [
            { text: 'CI / CD' },
            { text: 'Hosting' },
            { text: 'Monitoring' },
          ],
        },
      ],
    },
  },

  // ── 4. VINTAGE ─────────────────────────────────────────────────────────────
  {
    id: 'study-notes',
    name: 'Study Notes',
    description: 'Organise a subject into chapters, key concepts and review points.',
    icon: '📖',
    category: 'Education',
    theme: 'vintage',
    structure: {
      text: 'Subject',
      children: [
        {
          text: 'Chapter 1',
          children: [
            { text: 'Key concepts' },
            { text: 'Important formulas' },
            { text: 'Examples' },
          ],
        },
        {
          text: 'Chapter 2',
          children: [
            { text: 'Key concepts' },
            { text: 'Examples' },
          ],
        },
        {
          text: 'Review',
          children: [
            { text: 'Main takeaways' },
            { text: 'Common mistakes' },
            { text: 'Practice questions' },
          ],
        },
      ],
    },
  },
];

// ── Categories ────────────────────────────────────────────────────────────────
export const TEMPLATE_CATEGORIES = [
  { id: 'all',        name: 'All',        icon: '📂' },
  { id: 'Business',   name: 'Business',   icon: '💼' },
  { id: 'Creative',   name: 'Creative',   icon: '🎨' },
  { id: 'Technology', name: 'Technology', icon: '💻' },
  { id: 'Education',  name: 'Education',  icon: '🎓' },
];

export function getTemplatesByCategory(categoryId) {
  if (categoryId === 'all') return MINDMAP_TEMPLATES;
  return MINDMAP_TEMPLATES.filter(t => t.category === categoryId);
}

export function getTemplateById(templateId) {
  return MINDMAP_TEMPLATES.find(t => t.id === templateId);
}

// Human-readable theme labels for the UI
export function getThemeDisplayName(themeId) {
  return {
    modern:  '✨ Modern',
    sketch:  '✏️  Sketch',
    neon:    '⚡ Neon',
    vintage: '📜 Vintage',
  }[themeId] ?? themeId;
}