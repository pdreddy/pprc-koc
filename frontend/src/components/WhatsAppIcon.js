import React from 'react';

export default function WhatsAppIcon() {
  return (
    <span className="whatsapp-icon" aria-hidden="true">
      <svg viewBox="0 0 32 32" focusable="false" role="img">
        <path d="M16 3.2A12.5 12.5 0 0 0 5.4 22.3L4 28.8l6.7-1.4A12.5 12.5 0 1 0 16 3.2Zm0 22.5c-1.8 0-3.6-.5-5.1-1.4l-.4-.2-3.4.7.7-3.3-.3-.5A9.8 9.8 0 1 1 16 25.7Zm5.5-7.3c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.6-.1-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.7s1.2 3.1 1.3 3.3c.2.2 2.3 3.5 5.6 4.9.8.3 1.4.5 1.9.7.8.2 1.5.2 2.1.1.6-.1 1.8-.7 2.1-1.5.3-.7.3-1.4.2-1.5-.1-.1-.3-.2-.6-.4Z" />
      </svg>
    </span>
  );
}

export function WhatsAppShareButton({ href, onClick, label = 'Share on WhatsApp', ariaLabel, testId, busy = false }) {
  return (
    <a
      className="btn small success whatsapp-share-btn"
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      aria-label={ariaLabel || label}
      data-testid={testId}
      title={label}
      style={busy ? { opacity: .7 } : undefined}
    >
      <WhatsAppIcon /> <span>{label}</span>
    </a>
  );
}
