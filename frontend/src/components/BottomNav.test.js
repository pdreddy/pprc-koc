import { BOTTOM_NAV_MAX, getBottomNavTabs } from './BottomNav';
import { ROLES } from '../utils/roles';

test('captain bottom nav stays capped and includes Score overflow pattern', () => {
  const tabs = getBottomNavTabs({ role: ROLES.CAPTAIN });
  expect(tabs).toHaveLength(BOTTOM_NAV_MAX);
  expect(tabs.map(tab => tab.label)).toEqual(['Home', 'Score', 'Schedule', 'Standings', 'More']);
});

test('public bottom nav stays capped without score tab', () => {
  const tabs = getBottomNavTabs({ role: ROLES.GUEST });
  expect(tabs).toHaveLength(BOTTOM_NAV_MAX);
  expect(tabs.map(tab => tab.label)).toEqual(['Home', 'Schedule', 'Standings', 'Rules', 'More']);
});
