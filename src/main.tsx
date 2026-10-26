import React from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import App from './App';

async function boot() {
  createRoot(document.getElementById('root')!).render(<App />);
  setTimeout(() => {
    invoke('frontend_ready').catch(console.error);
  }, 700);
}

void boot();