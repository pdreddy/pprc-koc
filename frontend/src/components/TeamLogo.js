import React, { useState } from 'react';
import { getTeamLogoUrl } from '../utils/teamLogos';

/**
 * Unified team logo component.
 * Priority: team.logoUrl (Firebase) → static SVG → initials fallback.
 * Props:
 *   team       – team object with { abbreviation, name, logoUrl? }
 *   abbreviation – shortcut when no team object
 *   name       – display name for alt text
 *   size       – diameter in px (default 48)
 *   style      – extra inline styles on the outer logo shell
 *   className  – extra class names on the outer logo shell
 */
export default function TeamLogo({ team, abbreviation, name, size = 48, style = {}, className = '' }) {
  const abbr = team?.abbreviation || abbreviation || '';
  const displayName = team?.name || name || abbr || '?';
  const [imgError, setImgError] = useState(false);

  const url = (!imgError && (team?.logoUrl || getTeamLogoUrl(abbr))) || null;
  const pixelSize = typeof size === 'number' ? size : 48;
  const initials = (abbr || displayName[0] || '?').slice(0, 5);

  const shellStyle = {
    '--team-logo-size': `${pixelSize}px`,
    width: pixelSize,
    height: pixelSize,
    ...style,
  };

  return (
    <span
      className={`team-logo ${url ? 'has-image' : 'fallback'} ${className}`.trim()}
      style={shellStyle}
      title={displayName}
      aria-label={displayName}
      role="img"
    >
      {url ? (
        <img
          src={url}
          alt=""
          width={pixelSize}
          height={pixelSize}
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="team-logo-initials" aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}
