import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './agency_App';
// Import styles if available, or just rely on global/inline for now.
// The existing dashboard has tailwind or style.css?
// scripts/dashboard/style.css exists.
import './src/style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
