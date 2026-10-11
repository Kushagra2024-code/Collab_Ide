import React, { useRef, useEffect, useState } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../utils/rbacPermissions';
import { FileCode, Eye } from 'lucide-react';

export default function CodeEditor() {
  const {
    activeFile,
    updateFileContent,
    remoteCursors,
    broadcastCursor,
    setFiles
  } = useWorkspace();

  const { can } = useAuth();
  const editorRef = useRef(null);
  const [editorTheme, setEditorTheme] = useState('vs-dark');

  // Auto-correct language mode if file extension disagrees with stored language
  useEffect(() => {
    if (activeFile && activeFile.name) {
      const ext = activeFile.name.split('.').pop().toLowerCase();
      let expectedLang = activeFile.language;
      if (ext === 'py' && activeFile.language !== 'python') {
        expectedLang = 'python';
      } else if ((ext === 'js' || ext === 'jsx') && activeFile.language !== 'javascript') {
        expectedLang = 'javascript';
      } else if (ext === 'md' && activeFile.language !== 'markdown') {
        expectedLang = 'markdown';
      }

      if (expectedLang !== activeFile.language) {
        activeFile.language = expectedLang;
        fetch(`/api/files/${activeFile.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: activeFile.content, language: expectedLang })
        }).catch(err => console.error(err));
      }
    }
  }, [activeFile?.id, activeFile?.name]);

  const handleLanguageChange = (newLang) => {
    if (!activeFile) return;
    activeFile.language = newLang;
    fetch(`/api/files/${activeFile.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: activeFile.content, language: newLang })
    }).catch(err => console.error(err));
    // Trigger local state re-render
    updateFileContent(activeFile.id, activeFile.content);
  };

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;

    editor.onDidChangeCursorPosition((e) => {
      broadcastCursor({
        line: e.position.lineNumber,
        column: e.position.column
      });
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (activeFile && can(PERMISSIONS.EDIT_CODE)) {
        const saveBtn = document.getElementById('save-file-btn');
        if (saveBtn) saveBtn.click();
      }
    });
  };

  const handleEditorChange = (value) => {
    if (activeFile && can(PERMISSIONS.EDIT_CODE)) {
      updateFileContent(activeFile.id, value || '');
    }
  };

  if (!activeFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-dark-900 text-gray-500 p-8">
        <div className="w-16 h-16 rounded-2xl bg-dark-800 border border-gray-800 flex items-center justify-center mb-4 text-brand-400">
          <FileCode className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-gray-300 mb-1">No Active File</h3>
        <p className="text-xs text-gray-500 text-center max-w-sm">
          Select a file from the explorer on the left or create a new file to start real-time collaborative editing.
        </p>
      </div>
    );
  }

  const isReadOnly = !can(PERMISSIONS.EDIT_CODE);

  return (
    <div className="flex-1 flex flex-col h-full relative bg-dark-900 overflow-hidden">
      
      {/* Editor Subheader & Controls Bar */}
      <div className="h-7 bg-dark-800/80 border-b border-gray-800/80 px-3 flex items-center justify-between text-[11px] text-gray-400 font-mono select-none">
        <div className="flex items-center space-x-3">
          <span className="text-gray-300 font-medium">{activeFile.path}</span>
          
          {/* Interactive Language Selector Dropdown */}
          <select
            value={activeFile.language || 'javascript'}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-brand-400 focus:outline-none focus:border-brand-500 cursor-pointer font-bold"
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="typescript">TypeScript</option>
            <option value="html">HTML</option>
            <option value="css">CSS</option>
            <option value="json">JSON</option>
            <option value="markdown">Markdown</option>
          </select>

          {isReadOnly && (
            <span className="flex items-center space-x-1 text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              <Eye className="w-3 h-3" />
              <span>Viewer (Read-Only)</span>
            </span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          {/* Live Collaborator Cursors Summary */}
          {Object.keys(remoteCursors).length > 0 && (
            <div className="flex items-center space-x-1">
              <span className="text-gray-500">Live Cursors:</span>
              {Object.values(remoteCursors).map((c, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.2 rounded text-[10px] text-white font-bold"
                  style={{ backgroundColor: c.userAvatarColor || '#ec4899' }}
                >
                  {c.userName} (L{c.cursor?.line})
                </span>
              ))}
            </div>
          )}

          {/* Theme switcher */}
          <select
            value={editorTheme}
            onChange={(e) => setEditorTheme(e.target.value)}
            className="bg-gray-800 text-gray-300 text-[10px] px-1.5 py-0.5 rounded border border-gray-700 focus:outline-none"
          >
            <option value="vs-dark">Dark Theme</option>
            <option value="hc-black">High Contrast</option>
            <option value="light">Light Theme</option>
          </select>
        </div>
      </div>

      {/* Monaco Editor Container */}
      <div className="flex-1 relative">
        <MonacoEditor
          height="100%"
          language={activeFile.language}
          theme={editorTheme}
          value={activeFile.content}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            readOnly: isReadOnly,
            fontSize: 13,
            fontFamily: "'Fira Code', 'Consolas', monospace",
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            padding: { top: 12 },
            lineNumbersMinChars: 3,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on'
          }}
        />
      </div>

    </div>
  );
}
