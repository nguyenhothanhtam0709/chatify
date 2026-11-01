import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createSocketRealtime } from './realtime/socket-realtime';
import './index.css';

const createRealtime = (getAccessToken: () => string | undefined) =>
  createSocketRealtime({ url: window.location.origin, getAccessToken });

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App createRealtime={createRealtime} />
  </StrictMode>,
);
