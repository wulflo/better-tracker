import React from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import App from './App';
import { LanguageProvider } from './i18n';
import { ThemeProvider } from './theme';
import { installInputGuard } from './inputGuard';
import { isTauri } from './vault';
import './styles.css';

async function boot() {
  installInputGuard();
  createRoot(document.getElementById('root')!).render(
    <ThemeProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ThemeProvider>,
  );
  setTimeout(() => {
    if (isTauri()) invoke('frontend_ready').catch(console.error);
  }, 700);
}

void boot();
