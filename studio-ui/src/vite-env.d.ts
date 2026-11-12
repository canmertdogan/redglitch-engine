/// <reference types="vite/client" />
/// <reference types="node" />

declare module '*.css';

interface Window {
  RedglitchEventBus?: any;
  RedglitchProjectState?: any;
  RedglitchAssetManager?: any;
  SPRITES?: any;
  StudioBridge?: any;
}
