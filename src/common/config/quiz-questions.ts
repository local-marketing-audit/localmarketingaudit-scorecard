import type { Question } from '../types/quiz';

export const QUIZ_VERSION = '1.0';

export const questions: Question[] = [
  {
    id: 1,
    text: 'How easily can local customers find your business online?',
    hint: 'Think Google search, Maps, and local listings.',
    options: [
      { key: 'a', label: 'We rarely show up in local search results', tag: 'Needs attention', icon: '❌', points: 0 },
      { key: 'b', label: 'We show up sometimes, but not consistently', tag: 'Could be stronger', icon: '⚠️', points: 5 },
      { key: 'c', label: 'We consistently appear when customers search', tag: 'Strong position', icon: '✅', points: 10 },
    ],
  },
  {
    id: 2,
    text: 'Is your Google Business Profile fully optimized?',
    hint: 'Photos, services, hours, posts.',
    options: [
      { key: 'a', label: 'Not claimed or incomplete', tag: 'Missed opportunity', icon: '❌', points: 0 },
      { key: 'b', label: 'Claimed but rarely updated', tag: 'Basic setup', icon: '⚠️', points: 5 },
      { key: 'c', label: 'Fully optimized and active', tag: 'Well optimized', icon: '✅', points: 10 },
    ],
  },
  {
    id: 3,
    text: 'How clear is your website about what you do and where you serve?',
    options: [
      { key: 'a', label: 'Visitors have to figure it out', tag: 'Unclear', icon: '❌', points: 0 },
      { key: 'b', label: 'Some information is clear', tag: 'Needs refinement', icon: '⚠️', points: 5 },
      { key: 'c', label: 'Services and locations are instantly clear', tag: 'Crystal clear', icon: '✅', points: 10 },
    ],
  },
  {
    id: 4,
    text: 'How easy is it for customers to contact or book you?',
    options: [
      { key: 'a', label: 'Contact options are hard to find', tag: 'Friction exists', icon: '❌', points: 0 },
      { key: 'b', label: 'One main option (call or form)', tag: 'Usable', icon: '⚠️', points: 5 },
      { key: 'c', label: 'Multiple clear options (call, form, booking)', tag: 'Friction-free', icon: '✅', points: 10 },
    ],
  },
  {
    id: 5,
    text: 'How strong is your online reputation?',
    hint: 'Reviews & testimonials.',
    options: [
      { key: 'a', label: 'Few or no reviews', tag: 'Low trust', icon: '❌', points: 0 },
      { key: 'b', label: 'Some reviews, inconsistent', tag: 'Moderate trust', icon: '⚠️', points: 5 },
      { key: 'c', label: 'Many recent, positive reviews', tag: 'High trust', icon: '✅', points: 10 },
    ],
  },
  {
    id: 6,
    text: 'How often do you actively market your business?',
    options: [
      { key: 'a', label: 'Mostly word-of-mouth', tag: 'Unpredictable', icon: '❌', points: 0 },
      { key: 'b', label: 'Occasional posts or promotions', tag: 'Inconsistent', icon: '⚠️', points: 5 },
      { key: 'c', label: 'Consistent, intentional marketing', tag: 'Proactive', icon: '✅', points: 10 },
    ],
  },
  {
    id: 7,
    text: 'Do you track where your leads come from?',
    options: [
      { key: 'a', label: 'No tracking at all', tag: 'Flying blind', icon: '❌', points: 0 },
      { key: 'b', label: 'Rough idea, not measured', tag: 'Partially tracked', icon: '⚠️', points: 5 },
      { key: 'c', label: 'Calls, forms, and conversions tracked', tag: 'Data-driven', icon: '✅', points: 10 },
    ],
  },
  {
    id: 8,
    text: 'How well does your website perform on mobile devices?',
    options: [
      { key: 'a', label: 'Slow or difficult to use', tag: 'Needs improvement', icon: '❌', points: 0 },
      { key: 'b', label: 'Usable but not optimized', tag: 'Okay', icon: '⚠️', points: 5 },
      { key: 'c', label: 'Fast, smooth, mobile-friendly', tag: 'Excellent', icon: '✅', points: 10 },
    ],
  },
  {
    id: 9,
    text: 'How much trust and credibility does your website show?',
    options: [
      { key: 'a', label: 'No testimonials, photos, or proof', tag: 'Low credibility', icon: '❌', points: 0 },
      { key: 'b', label: 'Some trust elements', tag: 'Building trust', icon: '⚠️', points: 5 },
      { key: 'c', label: 'Strong social proof and local credibility', tag: 'Highly trusted', icon: '✅', points: 10 },
    ],
  },
  {
    id: 10,
    text: 'How consistent is your branding and messaging online?',
    hint: 'Website, Google profile, social platforms.',
    options: [
      { key: 'a', label: 'Inconsistent or outdated', tag: 'Confusing', icon: '❌', points: 0 },
      { key: 'b', label: 'Mostly consistent', tag: 'Acceptable', icon: '⚠️', points: 5 },
      { key: 'c', label: 'Clear and professional everywhere', tag: 'Strong brand', icon: '✅', points: 10 },
    ],
  },
];
