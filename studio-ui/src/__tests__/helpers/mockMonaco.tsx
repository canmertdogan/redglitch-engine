/**
 * Redglitch Game Studio - Monaco Editor Mock for Node / JSDOM Tests
 * Provides an in-memory textarea-backed editor component compatible with @monaco-editor/react.
 */

import React, { useState, useEffect, useRef, act } from 'react';

export const mockMonacoInstance = {
  editor: {
    defineTheme: (_name: string, _data: any) => {},
    setTheme: (_name: string) => {},
    createModel: (val: string, _lang?: string) => {
      let currentVal = val;
      return {
        getValue: () => currentVal,
        setValue: (newVal: string) => {
          currentVal = newVal;
        },
        getLineCount: () => {
          const lines = currentVal.split('\n');
          return lines.length || 1;
        },
        getFullModelRange: () => {
          const lines = currentVal.split('\n');
          const endLineNumber = lines.length || 1;
          const lastLine = lines[endLineNumber - 1] ?? '';
          return new mockMonacoInstance.Range(1, 1, endLineNumber, lastLine.length + 1);
        },
        getLineContent: (lineNumber?: number) => {
          if (typeof lineNumber === 'number') {
            const lines = currentVal.split('\n');
            return lines[lineNumber - 1] ?? '';
          }
          return currentVal;
        },
        dispose: () => {},
        uri: { toString: () => 'inmemory://model/1' },
      };
    },
    getModel: () => null,
    getModelMarkers: (_filter?: any) => [],
    setModelMarkers: (_model: any, _owner: string, _markers: any[]) => {},
    colorize: async (text: string) => text,
  },
  languages: {
    register: (_lang: any) => {},
    setMonarchTokensProvider: (_langId: string, _provider: any) => {},
    registerCompletionItemProvider: (_langId: string, _provider: any) => ({ dispose: () => {} }),
  },
  KeyMod: {
    CtrlCmd: 2048,
    Shift: 1024,
    Alt: 512,
    WinCtrl: 256,
  },
  KeyCode: {
    KeyS: 49,
    KeyF: 36,
  },
  Range: class Range {
    constructor(
      public startLineNumber: number,
      public startColumn: number,
      public endLineNumber: number,
      public endColumn: number
    ) {}
  },
  Position: class Position {
    constructor(public lineNumber: number, public column: number) {}
  },
  Uri: {
    parse: (s: string) => ({ toString: () => s }),
    file: (s: string) => ({ toString: () => s }),
  },
};

export const loader = {
  config: (_cfg: any) => {},
  init: async () => mockMonacoInstance,
};

export function useMonaco() {
  return mockMonacoInstance;
}

export interface MockEditorProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string | undefined, ev: any) => void;
  language?: string;
  theme?: string;
  height?: string | number;
  width?: string | number;
  options?: any;
  onMount?: (editor: any, monaco: any) => void;
  path?: string;
  'data-testid'?: string;
}

export default function MockEditor(props: MockEditorProps) {
  const [val, setVal] = useState<string>(props.value ?? props.defaultValue ?? '');
  const valRef = useRef<string>(val);
  valRef.current = val;

  useEffect(() => {
    if (props.value !== undefined) {
      setVal(props.value);
      valRef.current = props.value;
    }
  }, [props.value]);

  const editorInstanceRef = useRef<any>(null);
  if (!editorInstanceRef.current) {
    editorInstanceRef.current = {
      getValue: () => valRef.current,
      setValue: (newVal: string) => {
        act(() => {
          setVal(newVal);
          valRef.current = newVal;
        });
        props.onChange?.(newVal, null);
      },
      getPosition: () => ({ lineNumber: 1, column: 1 }),
      executeEdits: (_source: string, edits: Array<{ range?: any; text?: string }>) => {
        let currentVal = valRef.current;
        if (Array.isArray(edits)) {
          for (const edit of edits) {
            if (!edit) continue;
            const newText = edit.text ?? '';
            if (edit.range) {
              const { startLineNumber = 1, startColumn = 1, endLineNumber = 1, endColumn = 1 } = edit.range;
              const lines = currentVal.split('\n');
              const toOffset = (line: number, col: number) => {
                let off = 0;
                for (let i = 0; i < line - 1 && i < lines.length; i++) {
                  off += lines[i].length + 1;
                }
                if (line <= lines.length) {
                  off += Math.max(0, col - 1);
                } else {
                  off = currentVal.length;
                }
                return Math.min(off, currentVal.length);
              };
              const startOff = toOffset(startLineNumber, startColumn);
              const endOff = toOffset(endLineNumber, endColumn);
              currentVal = currentVal.slice(0, startOff) + newText + currentVal.slice(endOff);
            } else {
              currentVal = newText;
            }
          }
        }
        act(() => {
          setVal(currentVal);
          valRef.current = currentVal;
        });
        props.onChange?.(currentVal, null);
        return true;
      },
      focus: () => {},
      layout: () => {},
      dispose: () => {},
      addCommand: () => {},
      trigger: () => {},
      getAction: () => ({ run: () => {} }),
      getModel: () => ({
        getValue: () => valRef.current,
        getLineCount: () => {
          const lines = valRef.current.split('\n');
          return lines.length || 1;
        },
        getFullModelRange: () => {
          const lines = valRef.current.split('\n');
          const endLineNumber = lines.length || 1;
          const lastLine = lines[endLineNumber - 1] ?? '';
          return new mockMonacoInstance.Range(1, 1, endLineNumber, lastLine.length + 1);
        },
        getLineContent: (lineNumber?: number) => {
          if (typeof lineNumber === 'number') {
            const lines = valRef.current.split('\n');
            return lines[lineNumber - 1] ?? '';
          }
          return valRef.current;
        },
        setValue: (newVal: string) => {
          act(() => {
            setVal(newVal);
            valRef.current = newVal;
          });
          props.onChange?.(newVal, null);
        },
        uri: { toString: () => 'inmemory://model/1' },
      }),
      onDidChangeModelContent: () => ({ dispose: () => {} }),
    };
  }

  useEffect(() => {
    if (props.onMount) {
      props.onMount(editorInstanceRef.current, mockMonacoInstance);
    }
  }, []);

  return (
    <div
      data-testid={props['data-testid'] || 'monaco-editor-container'}
      style={{ width: props.width || '100%', height: props.height || '100%', position: 'relative' }}
    >
      <textarea
        data-testid="monaco-editor"
        data-language={props.language}
        data-path={props.path}
        value={val}
        onChange={(e) => {
          const next = e.target.value;
          setVal(next);
          valRef.current = next;
          props.onChange?.(next, e);
        }}
        style={{
          width: '100%',
          height: '100%',
          fontFamily: 'monospace',
          backgroundColor: '#1e1e1e',
          color: '#d4d4d4',
          border: 'none',
          resize: 'none',
        }}
      />
    </div>
  );
}

export const DiffEditor = MockEditor;
