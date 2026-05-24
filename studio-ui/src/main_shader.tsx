import React from 'react';
import ReactDOM from 'react-dom/client';
import ShaderEditor from './components/ShaderEditor';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ShaderEditor />
  </React.StrictMode>
);
