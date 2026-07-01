import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';

function isExternalMessengerTimeout(value = {}) {
  const message = String(value.message || value.reason?.message || value.reason || value.error?.message || '');
  const source = String(value.filename || value.source || '');
  const stack = String(value.error?.stack || value.reason?.stack || '');
  const isMessengerTimeout = message.includes('Window Messenger Timeout') && message.includes('urlChanged');
  const isExtensionSource = source.startsWith('chrome-extension://') || stack.includes('chrome-extension://');
  return isMessengerTimeout && isExtensionSource;
}

function installExternalErrorFilter() {
  window.addEventListener('error', (event) => {
    if (!isExternalMessengerTimeout(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    if (!isExternalMessengerTimeout(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

installExternalErrorFilter();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <App />
  </BrowserRouter>
);

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
