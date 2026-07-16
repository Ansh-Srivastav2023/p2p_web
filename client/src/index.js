// CRITICAL FIX: Inject Node.js polyfills globally for simple-peer
import process from 'process';
import { Buffer } from 'buffer';

window.process = process;
window.Buffer = Buffer;

// Existing imports
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);