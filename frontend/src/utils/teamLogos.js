// Maps team abbreviation → logo file in /logos/teams/
// Falls back to a generated initials avatar if no logo found.
const TEAM_LOGO_MAP = {
  RR: '/logos/teams/RR.svg',
  KC: '/logos/teams/KC.svg',
  SK: '/logos/teams/SK.svg',
  KOCCH: '/logos/teams/KOCCH.svg',
  RS: '/logos/teams/RS.svg',
  POSH: '/logos/teams/POSH.svg',
  CT: '/logos/teams/CT.svg',
  ML: '/logos/teams/ML.svg',
  CC: '/logos/teams/CC.svg',
  RCB: '/logos/teams/RCB.svg',
  VV: '/logos/teams/VV.svg',
  DC: '/logos/teams/DC.svg',
  BB: '/logos/teams/BB.svg',
  DD: '/logos/teams/DD.svg',
  CSK: '/logos/teams/CSK.svg',
  CM: '/logos/teams/CM.svg',
};

export function getTeamLogoUrl(abbreviation) {
  if (!abbreviation) return null;
  return TEAM_LOGO_MAP[abbreviation.toUpperCase()] || null;
}
