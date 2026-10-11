import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Code2,
  Bug,
  Lightbulb,
  Send,
  Copy,
  Check,
  Zap,
  Bot
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export default function AIAssistantPanel() {
  const { isAiOpen, setIsAiOpen, activeFile, updateFileContent } = useWorkspace();
  const [activeTab, setActiveTab] = useState('explain'); // 'explain', 'generate', 'refactor', 'chat'

  // Input states
  const [promptInput, setPromptInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { sender: 'ai', text: 'Hello! I am your AI Coding Assistant. How can I help optimize your workspace code today?' }
  ]);

  // Loading & Result states
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  if (!isAiOpen) return null;

  const handleExplain = async () => {
    if (!activeFile) return;
    setIsLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: activeFile.content, language: activeFile.language })
      });
      const data = await res.json();
      setResult(data.explanation);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!promptInput.trim()) return;
    setIsLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptInput, language: activeFile?.language || 'javascript' })
      });
      const data = await res.json();
      setResult(data.generatedCode);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefactor = async () => {
    if (!activeFile) return;
    setIsLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/ai/refactor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: activeFile.content })
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { sender: 'user', text: userMsg }]);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, activeFile: activeFile?.name })
      });
      const data = await res.json();
      setChatHistory(prev => [...prev, { sender: 'ai', text: data.reply }]);
    } catch (err) {
      console.error(err);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const insertIntoEditor = (codeSnippet) => {
    if (activeFile && codeSnippet) {
      updateFileContent(activeFile.id, activeFile.content + '\n\n' + codeSnippet);
      alert('Code inserted into active file!');
    }
  };

  return (
    <aside className="w-80 bg-dark-800 border-l border-gray-800/80 flex flex-col h-[calc(100vh-3.5rem)] z-20 shadow-2xl animate-in slide-in-from-right duration-200">
      
      {/* Drawer Header */}
      <div className="p-3 border-b border-gray-800 flex items-center justify-between bg-dark-900/50">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-brand-600 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-gray-200">
            AI Coding Assistant
          </span>
        </div>
        <button
          onClick={() => setIsAiOpen(false)}
          className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Tabs */}
      <div className="grid grid-cols-4 p-1.5 gap-1 bg-dark-900 border-b border-gray-800 text-[11px] font-medium">
        <button
          onClick={() => { setActiveTab('explain'); setResult(null); }}
          className={`py-1.5 px-1 rounded flex flex-col items-center space-y-1 transition-colors ${activeTab === 'explain' ? 'bg-brand-600/20 text-brand-400 border border-brand-500/30' : 'text-gray-400 hover:text-white'}`}
        >
          <Lightbulb className="w-3.5 h-3.5" />
          <span>Explain</span>
        </button>
        <button
          onClick={() => { setActiveTab('generate'); setResult(null); }}
          className={`py-1.5 px-1 rounded flex flex-col items-center space-y-1 transition-colors ${activeTab === 'generate' ? 'bg-brand-600/20 text-brand-400 border border-brand-500/30' : 'text-gray-400 hover:text-white'}`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Generate</span>
        </button>
        <button
          onClick={() => { setActiveTab('refactor'); setResult(null); }}
          className={`py-1.5 px-1 rounded flex flex-col items-center space-y-1 transition-colors ${activeTab === 'refactor' ? 'bg-brand-600/20 text-brand-400 border border-brand-500/30' : 'text-gray-400 hover:text-white'}`}
        >
          <Bug className="w-3.5 h-3.5" />
          <span>Refactor</span>
        </button>
        <button
          onClick={() => { setActiveTab('chat'); setResult(null); }}
          className={`py-1.5 px-1 rounded flex flex-col items-center space-y-1 transition-colors ${activeTab === 'chat' ? 'bg-brand-600/20 text-brand-400 border border-brand-500/30' : 'text-gray-400 hover:text-white'}`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>Chat</span>
        </button>
      </div>

      {/* Tab Body Contents */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3">

        {/* Explain Code Tab */}
        {activeTab === 'explain' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              Get an instant step-by-step breakdown of your currently active file (<span className="text-brand-400 font-mono">{activeFile?.name || 'none'}</span>).
            </p>
            <button
              onClick={handleExplain}
              disabled={isLoading || !activeFile}
              className="w-full py-2 px-3 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
            >
              {isLoading ? <Sparkles className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
              <span>{isLoading ? 'Analyzing Code...' : 'Analyze Active File'}</span>
            </button>

            {result && typeof result === 'string' && (
              <div className="p-3 bg-dark-900 rounded-lg border border-gray-800 text-xs text-gray-300 space-y-2 whitespace-pre-wrap">
                {result}
              </div>
            )}
          </div>
        )}

        {/* Generate Code Tab */}
        {activeTab === 'generate' && (
          <form onSubmit={handleGenerate} className="space-y-3">
            <label className="block text-xs text-gray-400">
              Describe the function or algorithm you want the AI to generate:
            </label>
            <textarea
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="e.g. Create an async handler to fetch workspace logs..."
              rows={3}
              className="w-full p-2.5 bg-dark-900 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
            />
            <button
              type="submit"
              disabled={isLoading || !promptInput.trim()}
              className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-brand-600 to-purple-600 text-white text-xs font-medium flex items-center justify-center space-x-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isLoading ? <Sparkles className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              <span>Generate Snippet</span>
            </button>

            {result && typeof result === 'string' && (
              <div className="space-y-2">
                <div className="p-3 bg-dark-900 rounded-lg border border-gray-800 text-xs font-mono text-emerald-400 overflow-x-auto relative group">
                  <pre>{result}</pre>
                </div>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(result)}
                    className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded border border-gray-700 flex items-center justify-center space-x-1"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => insertIntoEditor(result)}
                    className="flex-1 py-1.5 bg-brand-600/20 hover:bg-brand-600 text-brand-300 hover:text-white text-xs rounded border border-brand-500/30 flex items-center justify-center space-x-1"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>Insert Code</span>
                  </button>
                </div>
              </div>
            )}
          </form>
        )}

        {/* Refactor & Bug Finder Tab */}
        {activeTab === 'refactor' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              Run automated static inspection and performance optimizations on active file code.
            </p>
            <button
              onClick={handleRefactor}
              disabled={isLoading || !activeFile}
              className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
            >
              {isLoading ? <Sparkles className="w-4 h-4 animate-spin" /> : <Bug className="w-4 h-4" />}
              <span>Scan & Refactor Code</span>
            </button>

            {result && typeof result === 'object' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase">Analysis Findings:</span>
                  {result.analysis?.map((item, idx) => (
                    <div key={idx} className="p-2 bg-dark-900 border border-gray-800 rounded text-xs text-gray-300 flex items-start space-x-2">
                      <span className="text-amber-400 font-bold">●</span>
                      <span>{item.text}</span>
                    </div>
                  ))}
                </div>
                <div className="p-3 bg-dark-900 rounded-lg border border-gray-800 text-xs font-mono text-indigo-300 overflow-x-auto">
                  <pre>{result.refactoredCode}</pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Workspace Chat Tab */}
        {activeTab === 'chat' && (
          <div className="h-full flex flex-col justify-between space-y-3">
            <div className="flex-1 space-y-2 overflow-y-auto max-h-[360px] pr-1">
              {chatHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-lg text-xs ${msg.sender === 'user' ? 'bg-brand-600/20 border border-brand-500/30 text-brand-200 ml-4' : 'bg-dark-900 border border-gray-800 text-gray-300 mr-4'}`}
                >
                  <div className="text-[10px] font-bold uppercase text-gray-500 mb-1">
                    {msg.sender === 'user' ? 'You' : 'AI Assistant'}
                  </div>
                  <p>{msg.text}</p>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendChat} className="flex space-x-1">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask AI about codebase..."
                className="flex-1 px-2.5 py-1.5 bg-dark-900 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-brand-500"
              />
              <button
                type="submit"
                className="p-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}

      </div>

    </aside>
  );
}
