jest.mock('../services/AuditService', () => ({ writeAuditLog: jest.fn() }));
import { buildMoreSections } from './More';
import { ROLES } from '../utils/roles';

const labels = (sections) => sections.flatMap(section => section.items.map(item => item.label));

test('captain More shortcuts include lineup, notifications, and public overflow links', () => {
  const sectionLabels = buildMoreSections({ role: ROLES.CAPTAIN, teamName: 'Baseline Bashers' }).map(section => section.title);
  const itemLabels = labels(buildMoreSections({ role: ROLES.CAPTAIN, teamName: 'Baseline Bashers' }));
  expect(sectionLabels).toContain('Captain shortcuts');
  expect(itemLabels).toEqual(expect.arrayContaining(['My Lineup', 'Enter Score', 'Notifications', 'Matchups', 'Rules', 'Match History']));
});

test('super admin More shortcuts include admin, audit, team management, and public overflow links', () => {
  const itemLabels = labels(buildMoreSections({ role: ROLES.SUPER_ADMIN }));
  expect(itemLabels).toEqual(expect.arrayContaining(['Admin Dashboard', 'Audit Logs', 'Team Management', 'Enter Score', 'Schedule']));
});
