// Frontend/src/data/mindmapTemplates.js - WITH DISTINCT THEMES

export const MINDMAP_TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank Canvas',
    description: 'Start from scratch with an empty mindmap',
    icon: '📄',
    category: 'General',
    theme: 'modern', // Clean default
    structure: null
  },
  
  {
    id: 'project-planning',
    name: 'Project Planning',
    description: 'Organize your project with phases, tasks, and resources',
    icon: '📋',
    category: 'Business',
    theme: 'modern', // Clean, professional
    color: '#1e40af',
    structure: {
      text: 'Project Name',
      children: [
        {
          text: 'Goals & Objectives',
          children: [
            { text: 'Primary Goal' },
            { text: 'Secondary Goals' },
            { text: 'Success Metrics' }
          ]
        },
        {
          text: 'Timeline',
          children: [
            { text: 'Phase 1' },
            { text: 'Phase 2' },
            { text: 'Milestones' }
          ]
        },
        {
          text: 'Team & Resources',
          children: [
            { text: 'Team Members' },
            { text: 'Budget' },
            { text: 'Tools & Equipment' }
          ]
        },
        {
          text: 'Risks & Mitigation',
          children: [
            { text: 'Potential Risks' },
            { text: 'Contingency Plans' }
          ]
        }
      ]
    }
  },

  {
    id: 'swot-analysis',
    name: 'SWOT Analysis',
    description: 'Analyze Strengths, Weaknesses, Opportunities, and Threats',
    icon: '📊',
    category: 'Business',
    theme: 'blueprint', // Technical analysis look
    color: '#10b981',
    structure: {
      text: 'SWOT Analysis',
      children: [
        {
          text: 'Strengths',
          children: [
            { text: 'Core competencies' },
            { text: 'Competitive advantages' },
            { text: 'Unique resources' }
          ]
        },
        {
          text: 'Weaknesses',
          children: [
            { text: 'Areas for improvement' },
            { text: 'Resource limitations' },
            { text: 'Knowledge gaps' }
          ]
        },
        {
          text: 'Opportunities',
          children: [
            { text: 'Market trends' },
            { text: 'Growth potential' },
            { text: 'Partnerships' }
          ]
        },
        {
          text: 'Threats',
          children: [
            { text: 'Competition' },
            { text: 'Market changes' },
            { text: 'External risks' }
          ]
        }
      ]
    }
  },

  {
    id: 'study-notes',
    name: 'Study Notes',
    description: 'Organize learning materials by topics and subtopics',
    icon: '📚',
    category: 'Education',
    theme: 'sketch', // Fun, hand-drawn for students
    color: '#8b5cf6',
    structure: {
      text: 'Course/Subject',
      children: [
        {
          text: 'Chapter 1',
          children: [
            { text: 'Key Concepts' },
            { text: 'Important Formulas' },
            { text: 'Examples' },
            { text: 'Practice Questions' }
          ]
        },
        {
          text: 'Chapter 2',
          children: [
            { text: 'Key Concepts' },
            { text: 'Important Formulas' },
            { text: 'Examples' }
          ]
        },
        {
          text: 'Summary & Review',
          children: [
            { text: 'Main Takeaways' },
            { text: 'Common Mistakes' }
          ]
        }
      ]
    }
  },

  {
    id: 'meeting-agenda',
    name: 'Meeting Agenda',
    description: 'Structure your meeting with topics and action items',
    icon: '🗓️',
    category: 'Business',
    theme: 'modern',
    color: '#f59e0b',
    structure: {
      text: 'Meeting: [Date]',
      children: [
        {
          text: 'Attendees',
          children: [
            { text: 'Required participants' },
            { text: 'Optional participants' }
          ]
        },
        {
          text: 'Agenda Items',
          children: [
            { text: 'Topic 1 (10 min)' },
            { text: 'Topic 2 (15 min)' },
            { text: 'Q&A (5 min)' }
          ]
        },
        {
          text: 'Action Items',
          children: [
            { text: 'Task 1 - Owner' },
            { text: 'Task 2 - Owner' }
          ]
        },
        {
          text: 'Next Steps',
          children: [
            { text: 'Follow-up meeting' },
            { text: 'Deliverables & deadlines' }
          ]
        }
      ]
    }
  },

  {
    id: 'brainstorming',
    name: 'Brainstorming Session',
    description: 'Capture and organize creative ideas',
    icon: '💡',
    category: 'Creative',
    theme: 'cartoon', // Fun, creative style
    color: '#ec4899',
    structure: {
      text: 'Central Topic/Problem',
      children: [
        {
          text: 'Ideas - Category 1',
          children: [
            { text: 'Idea 1.1' },
            { text: 'Idea 1.2' },
            { text: 'Idea 1.3' }
          ]
        },
        {
          text: 'Ideas - Category 2',
          children: [
            { text: 'Idea 2.1' },
            { text: 'Idea 2.2' }
          ]
        },
        {
          text: 'Wild Ideas',
          children: [
            { text: 'Out-of-the-box thinking' }
          ]
        },
        {
          text: 'Next Actions',
          children: [
            { text: 'Most promising ideas' },
            { text: 'Prototyping plan' }
          ]
        }
      ]
    }
  },

  {
    id: 'decision-making',
    name: 'Decision Making',
    description: 'Evaluate options with pros and cons',
    icon: '⚖️',
    category: 'Business',
    theme: 'modern',
    color: '#14b8a6',
    structure: {
      text: 'Decision to Make',
      children: [
        {
          text: 'Option A',
          children: [
            { text: 'Pros' },
            { text: 'Cons' },
            { text: 'Cost/Impact' }
          ]
        },
        {
          text: 'Option B',
          children: [
            { text: 'Pros' },
            { text: 'Cons' },
            { text: 'Cost/Impact' }
          ]
        },
        {
          text: 'Option C',
          children: [
            { text: 'Pros' },
            { text: 'Cons' },
            { text: 'Cost/Impact' }
          ]
        },
        {
          text: 'Criteria & Weights',
          children: [
            { text: 'Criterion 1 (30%)' },
            { text: 'Criterion 2 (50%)' },
            { text: 'Criterion 3 (20%)' }
          ]
        }
      ]
    }
  },

  {
    id: 'personal-goals',
    name: 'Personal Goals',
    description: 'Plan and track your personal development goals',
    icon: '🎯',
    category: 'Personal',
    theme: 'fluid', // Organic, flowing for personal growth
    color: '#ef4444',
    structure: {
      text: 'My Goals - 2026',
      children: [
        {
          text: 'Health & Fitness',
          children: [
            { text: 'Exercise routine' },
            { text: 'Nutrition plan' },
            { text: 'Sleep schedule' }
          ]
        },
        {
          text: 'Career & Skills',
          children: [
            { text: 'New skills to learn' },
            { text: 'Career milestones' },
            { text: 'Networking goals' }
          ]
        },
        {
          text: 'Financial',
          children: [
            { text: 'Savings targets' },
            { text: 'Investment plans' },
            { text: 'Budget optimization' }
          ]
        },
        {
          text: 'Personal Growth',
          children: [
            { text: 'Hobbies & interests' },
            { text: 'Relationships' },
            { text: 'Mindfulness practices' }
          ]
        }
      ]
    }
  },

  {
    id: 'software-architecture',
    name: 'Software Architecture',
    description: 'Design system components and relationships',
    icon: '🏗️',
    category: 'Technology',
    theme: 'circuit', // Circuit board for tech
    color: '#6366f1',
    structure: {
      text: 'System Architecture',
      children: [
        {
          text: 'Frontend Layer',
          children: [
            { text: 'User Interface' },
            { text: 'State Management' },
            { text: 'Routing' }
          ]
        },
        {
          text: 'Backend Layer',
          children: [
            { text: 'API Gateway' },
            { text: 'Business Logic' },
            { text: 'Authentication' }
          ]
        },
        {
          text: 'Data Layer',
          children: [
            { text: 'Database' },
            { text: 'Caching' },
            { text: 'File Storage' }
          ]
        },
        {
          text: 'Infrastructure',
          children: [
            { text: 'Hosting' },
            { text: 'CI/CD' },
            { text: 'Monitoring' }
          ]
        }
      ]
    }
  },

  {
    id: 'event-planning',
    name: 'Event Planning',
    description: 'Organize all aspects of your event',
    icon: '🎉',
    category: 'Personal',
    theme: 'vintage', // Elegant vintage for events
    color: '#f97316',
    structure: {
      text: 'Event Name',
      children: [
        {
          text: 'Venue & Date',
          children: [
            { text: 'Location options' },
            { text: 'Date & time' },
            { text: 'Capacity' }
          ]
        },
        {
          text: 'Budget',
          children: [
            { text: 'Venue costs' },
            { text: 'Catering' },
            { text: 'Entertainment' },
            { text: 'Miscellaneous' }
          ]
        },
        {
          text: 'Guest List',
          children: [
            { text: 'Confirmed attendees' },
            { text: 'Pending invites' },
            { text: 'VIP guests' }
          ]
        },
        {
          text: 'Tasks & Timeline',
          children: [
            { text: '3 months before' },
            { text: '1 month before' },
            { text: '1 week before' },
            { text: 'Day of event' }
          ]
        }
      ]
    }
  },

  {
    id: 'okr-framework',
    name: 'OKR Framework',
    description: 'Set Objectives and Key Results for your team',
    icon: '📈',
    category: 'Business',
    theme: 'modern',
    color: '#84cc16',
    structure: {
      text: 'Quarterly OKRs',
      children: [
        {
          text: 'Objective 1',
          children: [
            { text: 'Key Result 1.1 (Metric)' },
            { text: 'Key Result 1.2 (Metric)' },
            { text: 'Key Result 1.3 (Metric)' }
          ]
        },
        {
          text: 'Objective 2',
          children: [
            { text: 'Key Result 2.1 (Metric)' },
            { text: 'Key Result 2.2 (Metric)' }
          ]
        },
        {
          text: 'Objective 3',
          children: [
            { text: 'Key Result 3.1 (Metric)' },
            { text: 'Key Result 3.2 (Metric)' }
          ]
        },
        {
          text: 'Initiatives & Actions',
          children: [
            { text: 'Projects to support OKRs' },
            { text: 'Resource allocation' }
          ]
        }
      ]
    }
  },

  {
    id: 'book-summary',
    name: 'Book Summary',
    description: 'Summarize key points and insights from a book',
    icon: '📖',
    category: 'Education',
    theme: 'sketch', // Hand-drawn for personal notes
    color: '#a855f7',
    structure: {
      text: 'Book Title',
      children: [
        {
          text: 'Main Themes',
          children: [
            { text: 'Theme 1' },
            { text: 'Theme 2' },
            { text: 'Theme 3' }
          ]
        },
        {
          text: 'Key Concepts',
          children: [
            { text: 'Concept 1' },
            { text: 'Concept 2' },
            { text: 'Concept 3' }
          ]
        },
        {
          text: 'Memorable Quotes',
          children: [
            { text: 'Quote 1' },
            { text: 'Quote 2' }
          ]
        },
        {
          text: 'Actionable Takeaways',
          children: [
            { text: 'Action 1' },
            { text: 'Action 2' },
            { text: 'Action 3' }
          ]
        }
      ]
    }
  },

  {
    id: 'cybersecurity',
    name: 'Cybersecurity Plan',
    description: 'Plan and document security measures',
    icon: '🔒',
    category: 'Technology',
    theme: 'circuit', // Circuit/tech theme for security
    color: '#00ffff',
    structure: {
      text: 'Security Framework',
      children: [
        {
          text: 'Threats & Risks',
          children: [
            { text: 'External threats' },
            { text: 'Internal vulnerabilities' },
            { text: 'Risk assessment' }
          ]
        },
        {
          text: 'Defense Layers',
          children: [
            { text: 'Network security' },
            { text: 'Application security' },
            { text: 'Data encryption' }
          ]
        },
        {
          text: 'Monitoring',
          children: [
            { text: 'Intrusion detection' },
            { text: 'Log analysis' },
            { text: 'Incident response' }
          ]
        },
        {
          text: 'Compliance',
          children: [
            { text: 'Standards (ISO, NIST)' },
            { text: 'Audit requirements' },
            { text: 'Documentation' }
          ]
        }
      ]
    }
  }
];

// Group templates by category
export const TEMPLATE_CATEGORIES = [
  { id: 'all', name: 'All Templates', icon: '📂' },
  { id: 'Business', name: 'Business', icon: '💼' },
  { id: 'Education', name: 'Education', icon: '🎓' },
  { id: 'Personal', name: 'Personal', icon: '👤' },
  { id: 'Technology', name: 'Technology', icon: '💻' },
  { id: 'Creative', name: 'Creative', icon: '🎨' },
  { id: 'General', name: 'General', icon: '📄' }
];

// Get templates by category
export function getTemplatesByCategory(categoryId) {
  if (categoryId === 'all') {
    return MINDMAP_TEMPLATES;
  }
  return MINDMAP_TEMPLATES.filter(t => t.category === categoryId);
}

// Get template by ID
export function getTemplateById(templateId) {
  return MINDMAP_TEMPLATES.find(t => t.id === templateId);
}

// Get theme display name
export function getThemeDisplayName(themeId) {
  const themeNames = {
    modern: '✨ Modern',
    sketch: '✏️ Sketch',
    cartoon: '🎨 Cartoon',
    circuit: '⚡ Circuit',
    blueprint: '📐 Blueprint',
    fluid: '🌊 Fluid',
    vintage: '📜 Vintage'
  };
  return themeNames[themeId] || themeId;
}