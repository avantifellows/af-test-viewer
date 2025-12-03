"use client";

import { useState, useEffect, useCallback } from "react";
import Script from "next/script";


interface Option {
  text: string;
}

interface Problem {
  text: string;
  passage_text?: string;
  options?: Option[];
  solution?: string;
}

interface ProblemSection {
  subject: string;
  [key: string]: Problem[] | string;
}

interface Test {
  code: string;
  name: string;
  duration: string;
  marks: string;
  problems: ProblemSection[];
}

interface SolutionState {
  hintLoading: boolean;
  solutionLoading: boolean;
  aiHints: string[];
  aiSolution?: string;
  hintError?: string;
  solutionError?: string;
  showPanel: boolean;
}

const DEFAULT_PROMPT_PLACEHOLDER = "Loading...";

export default function Home() {
  const [testId, setTestId] = useState("");
  const [test, setTest] = useState<Test | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mathJaxReady, setMathJaxReady] = useState(false);
  const [solutions, setSolutions] = useState<Record<string, SolutionState>>({});
  const [activeTab, setActiveTab] = useState<"viewer" | "prompt">("viewer");

  // Hint prompts
  const [defaultHintPrompt, setDefaultHintPrompt] = useState(DEFAULT_PROMPT_PLACEHOLDER);
  const [customHintPrompt, setCustomHintPrompt] = useState("");

  // Solution prompts
  const [defaultSolutionPrompt, setDefaultSolutionPrompt] = useState(DEFAULT_PROMPT_PLACEHOLDER);
  const [customSolutionPrompt, setCustomSolutionPrompt] = useState("");

  // Fetch default prompts on mount
  useEffect(() => {
    fetch("/api/generate-solution")
      .then((res) => res.json())
      .then((data) => {
        setDefaultHintPrompt(data.defaultHintPrompt);
        setCustomHintPrompt(data.defaultHintPrompt);
        setDefaultSolutionPrompt(data.defaultSolutionPrompt);
        setCustomSolutionPrompt(data.defaultSolutionPrompt);
      })
      .catch(console.error);
  }, []);

  // Re-typeset MathJax when test or solutions change
  useEffect(() => {
    if (mathJaxReady && window.MathJax) {
      window.MathJax.typesetPromise?.();
    }
  }, [test, solutions, mathJaxReady]);

  const fetchTest = async (id?: string) => {
    const targetId = id || testId;
    if (!targetId.trim()) {
      setError("Please enter a Test ID");
      return;
    }

    setLoading(true);
    setError(null);
    setTest(null);
    setSolutions({});

    try {
      const response = await fetch(`/api/test/${encodeURIComponent(targetId)}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to fetch test");
      } else {
        setTest(data);
      }
    } catch (err) {
      setError("Failed to fetch test");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getProblems = (section: ProblemSection): Problem[] => {
    const key = section.subject.toLowerCase().replace(/\s/g, "_") + "_problems";
    return (section[key] as Problem[]) || [];
  };

  const generateHint = useCallback(async (problemKey: string, problem: Problem) => {
    const currentState = solutions[problemKey];
    const previousHints = currentState?.aiHints || [];

    setSolutions((prev) => ({
      ...prev,
      [problemKey]: {
        ...prev[problemKey],
        hintLoading: true,
        solutionLoading: prev[problemKey]?.solutionLoading || false,
        aiHints: prev[problemKey]?.aiHints || [],
        showPanel: true,
      },
    }));

    try {
      const response = await fetch("/api/generate-solution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionText: problem.text,
          passageText: problem.passage_text,
          options: problem.options,
          type: "hint",
          previousHints: previousHints,
          customPrompt: customHintPrompt !== defaultHintPrompt ? customHintPrompt : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate hint");
      }

      setSolutions((prev) => ({
        ...prev,
        [problemKey]: {
          ...prev[problemKey],
          hintLoading: false,
          aiHints: [...(prev[problemKey]?.aiHints || []), data.solution],
        },
      }));
    } catch (err) {
      console.error("Error generating hint:", err);
      setSolutions((prev) => ({
        ...prev,
        [problemKey]: {
          ...prev[problemKey],
          hintLoading: false,
          hintError: err instanceof Error ? err.message : "Failed to generate hint",
        },
      }));
    }
  }, [customHintPrompt, defaultHintPrompt, solutions]);

  const generateSolution = useCallback(async (problemKey: string, problem: Problem) => {
    setSolutions((prev) => ({
      ...prev,
      [problemKey]: {
        ...prev[problemKey],
        solutionLoading: true,
        hintLoading: prev[problemKey]?.hintLoading || false,
        aiHints: prev[problemKey]?.aiHints || [],
        showPanel: true,
      },
    }));

    try {
      const response = await fetch("/api/generate-solution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionText: problem.text,
          passageText: problem.passage_text,
          options: problem.options,
          type: "solution",
          customPrompt: customSolutionPrompt !== defaultSolutionPrompt ? customSolutionPrompt : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate solution");
      }

      setSolutions((prev) => ({
        ...prev,
        [problemKey]: {
          ...prev[problemKey],
          solutionLoading: false,
          aiSolution: data.solution,
        },
      }));
    } catch (err) {
      console.error("Error generating solution:", err);
      setSolutions((prev) => ({
        ...prev,
        [problemKey]: {
          ...prev[problemKey],
          solutionLoading: false,
          solutionError: err instanceof Error ? err.message : "Failed to generate solution",
        },
      }));
    }
  }, [customSolutionPrompt, defaultSolutionPrompt]);

  let questionNumber = 0;

  return (
    <>
      <Script
        id="mathjax-config"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.MathJax = {
              startup: {
                ready: () => {
                  MathJax.startup.defaultReady();
                }
              },
              chtml: {
                scale: 0.9,
                minScale: 0.5
              },
              tex: {
                inlineMath: [["$", "$"], ["\\\\(", "\\\\)"]],
                displayMath: [["$$", "$$"], ["\\\\[", "\\\\]"]],
                processEscapes: true,
                autoload: {
                  color: [],
                  colorv2: ['color']
                },
                packages: {'[+]': ['noerrors']}
              },
              options: {
                ignoreHtmlClass: "no-mathjax",
                processHtmlClass: 'tex2jax_process'
              },
              loader: {
                load: ['[tex]/noerrors']
              }
            };
          `,
        }}
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"
        strategy="afterInteractive"
        onReady={() => setMathJaxReady(true)}
      />

      <div className="min-h-screen bg-gray-50 p-8">
        <main className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Test Viewer</h1>

          {/* Tab Navigation */}
          <div className="flex border-b border-gray-300 mb-6">
            <button
              onClick={() => setActiveTab("viewer")}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === "viewer"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Test Viewer
            </button>
            <button
              onClick={() => setActiveTab("prompt")}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === "prompt"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Prompt Manager
              {(customHintPrompt !== defaultHintPrompt || customSolutionPrompt !== defaultSolutionPrompt) && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded">
                  Modified
                </span>
              )}
            </button>
          </div>

          {/* Prompt Manager Tab */}
          {activeTab === "prompt" && (
            <div className="space-y-6">
              <p className="text-sm text-gray-600">
                Use <code className="bg-gray-100 px-1 rounded">{"{{QUESTION_CONTENT}}"}</code> as
                a placeholder where the question text, passage, and options will be inserted.
              </p>

              {/* Hint Prompt */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-yellow-700">
                    Hint Prompt
                  </h2>
                  <button
                    onClick={() => setCustomHintPrompt(defaultHintPrompt)}
                    disabled={customHintPrompt === defaultHintPrompt}
                    className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Reset to Default
                  </button>
                </div>
                <textarea
                  value={customHintPrompt}
                  onChange={(e) => setCustomHintPrompt(e.target.value)}
                  className="w-full h-64 p-4 border border-yellow-300 rounded-lg font-mono text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  placeholder="Enter your hint prompt..."
                />
                {customHintPrompt !== defaultHintPrompt && (
                  <p className="mt-2 text-sm text-yellow-600">Modified from default</p>
                )}
              </div>

              {/* Solution Prompt */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-green-700">
                    Solution Prompt
                  </h2>
                  <button
                    onClick={() => setCustomSolutionPrompt(defaultSolutionPrompt)}
                    disabled={customSolutionPrompt === defaultSolutionPrompt}
                    className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Reset to Default
                  </button>
                </div>
                <textarea
                  value={customSolutionPrompt}
                  onChange={(e) => setCustomSolutionPrompt(e.target.value)}
                  className="w-full h-64 p-4 border border-green-300 rounded-lg font-mono text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Enter your solution prompt..."
                />
                {customSolutionPrompt !== defaultSolutionPrompt && (
                  <p className="mt-2 text-sm text-green-600">Modified from default</p>
                )}
              </div>
            </div>
          )}

          {/* Test Viewer Tab */}
          {activeTab === "viewer" && (
            <>
              <div className="flex gap-4 mb-8">
            <input
              type="text"
              value={testId}
              onChange={(e) => setTestId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchTest()}
              placeholder="Enter CMS Test ID (e.g., 5624c9f169702d71b8002702)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
            />
            <button
              onClick={() => fetchTest()}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
            >
              {loading ? "Loading..." : "Fetch Test"}
            </button>
          </div>

          {error && (
            <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg mb-4">
              {error}
            </div>
          )}

          {test && (
            <div className="bg-white rounded-lg shadow-md p-8 print:shadow-none">
              {/* Header */}
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {test.name}
                </h2>
                <p className="text-gray-600">Test Code: {test.code}</p>
              </div>

              {/* Test Details */}
              <div className="flex justify-between border-b border-gray-300 pb-4 mb-6">
                <span className="text-gray-700">
                  Duration: {test.duration} minutes
                </span>
                <span className="text-gray-700">Total Marks: {test.marks}</span>
              </div>

              {/* Problems */}
              {test.problems?.map((section, sectionIdx) => (
                <div key={sectionIdx} className="mb-8">
                  <h3 className="text-xl font-semibold text-blue-800 border-b-2 border-blue-800 pb-2 mb-4">
                    {section.subject}
                  </h3>

                  {getProblems(section).map((problem, problemIdx) => {
                    questionNumber++;
                    const problemKey = `${sectionIdx}-${problemIdx}`;
                    const solutionState = solutions[problemKey];

                    return (
                      <div
                        key={problemIdx}
                        className="mb-8 pb-6 border-b border-gray-200 last:border-b-0"
                      >
                        {/* Problem Content */}
                        <div className="bg-white p-4 rounded">
                          <div className="flex gap-2">
                            <span className="font-bold text-gray-900 shrink-0">
                              Q{questionNumber}:
                            </span>
                            <div className="flex-1">
                              {problem.passage_text && (
                                <div
                                  className="mb-3 p-3 bg-gray-100 rounded text-gray-800"
                                  dangerouslySetInnerHTML={{
                                    __html: problem.passage_text,
                                  }}
                                />
                              )}
                              <div
                                className="text-gray-800 mb-3"
                                dangerouslySetInnerHTML={{ __html: problem.text }}
                              />

                              {/* Options */}
                              {problem.options && problem.options.length > 0 && (
                                <div className="grid grid-cols-2 gap-2 mt-3">
                                  {problem.options.map((option, optIdx) => (
                                    <div
                                      key={optIdx}
                                      className="flex gap-2 text-gray-700"
                                    >
                                      <span className="font-semibold">
                                        {String.fromCharCode(65 + optIdx)}.
                                      </span>
                                      <span
                                        dangerouslySetInnerHTML={{
                                          __html: option.text,
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Generate Buttons */}
                        <div className="mt-4 flex gap-2">
                          <button
                            onClick={() => generateHint(problemKey, problem)}
                            disabled={solutionState?.hintLoading}
                            className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:bg-yellow-300 transition-colors text-sm"
                          >
                            {solutionState?.hintLoading
                              ? "Generating..."
                              : solutionState?.aiHints?.length
                              ? `Generate Next Hint (${solutionState.aiHints.length})`
                              : "Generate Hint"}
                          </button>
                          <button
                            onClick={() => generateSolution(problemKey, problem)}
                            disabled={solutionState?.solutionLoading}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-300 transition-colors text-sm"
                          >
                            {solutionState?.solutionLoading
                              ? "Generating..."
                              : "Generate Solution"}
                          </button>
                        </div>

                        {/* Solutions Display */}
                        {solutionState?.showPanel && (
                          <div className="mt-4 space-y-4">
                            {/* AI Hints */}
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                              <h4 className="font-semibold text-yellow-800 mb-2">
                                AI Hints {solutionState.aiHints?.length > 0 && `(${solutionState.aiHints.length})`}
                              </h4>
                              {solutionState.hintError ? (
                                <p className="text-red-600 text-sm">
                                  {solutionState.hintError}
                                </p>
                              ) : solutionState.aiHints?.length > 0 ? (
                                <div className="space-y-3">
                                  {solutionState.aiHints.map((hint, idx) => (
                                    <div key={idx} className="border-l-2 border-yellow-400 pl-3">
                                      <span className="font-medium text-yellow-700 text-sm">
                                        Hint {idx + 1}:
                                      </span>
                                      <div
                                        className="text-gray-800 text-sm whitespace-pre-wrap mt-1"
                                        dangerouslySetInnerHTML={{
                                          __html: hint.replace(/\n/g, "<br>"),
                                        }}
                                      />
                                    </div>
                                  ))}
                                  {solutionState.hintLoading && (
                                    <div className="flex items-center gap-2 text-gray-500 border-l-2 border-yellow-400 pl-3">
                                      <div className="animate-spin h-4 w-4 border-2 border-yellow-600 border-t-transparent rounded-full"></div>
                                      <span className="text-sm">Generating next hint...</span>
                                    </div>
                                  )}
                                </div>
                              ) : solutionState.hintLoading ? (
                                <div className="flex items-center gap-2 text-gray-500">
                                  <div className="animate-spin h-4 w-4 border-2 border-yellow-600 border-t-transparent rounded-full"></div>
                                  <span className="text-sm">Generating hint...</span>
                                </div>
                              ) : (
                                <p className="text-gray-500 italic text-sm">
                                  Click &quot;Generate Hint&quot; to get progressive hints
                                </p>
                              )}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {/* CMS Solution */}
                              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <h4 className="font-semibold text-blue-800 mb-2">
                                  CMS Solution
                                </h4>
                                {problem.solution ? (
                                  <div
                                    className="text-gray-800 text-sm"
                                    dangerouslySetInnerHTML={{
                                      __html: problem.solution,
                                    }}
                                  />
                                ) : (
                                  <p className="text-gray-500 italic text-sm">
                                    No solution available
                                  </p>
                                )}
                              </div>

                              {/* AI Solution */}
                              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <h4 className="font-semibold text-green-800 mb-2">
                                  AI Solution (Gemini)
                                </h4>
                                {solutionState.solutionLoading ? (
                                  <div className="flex items-center gap-2 text-gray-500">
                                    <div className="animate-spin h-4 w-4 border-2 border-green-600 border-t-transparent rounded-full"></div>
                                    <span className="text-sm">Generating solution...</span>
                                  </div>
                                ) : solutionState.solutionError ? (
                                  <p className="text-red-600 text-sm">
                                    {solutionState.solutionError}
                                  </p>
                                ) : solutionState.aiSolution ? (
                                  <div
                                    className="text-gray-800 text-sm whitespace-pre-wrap"
                                    dangerouslySetInnerHTML={{
                                      __html: solutionState.aiSolution.replace(
                                        /\n/g,
                                        "<br>"
                                      ),
                                    }}
                                  />
                                ) : (
                                  <p className="text-gray-500 italic text-sm">
                                    Click &quot;Generate Solution&quot; to get AI solution
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Back button */}
              <button
                onClick={() => {
                  setTest(null);
                  setSolutions({});
                }}
                className="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              >
                Back to Test List
              </button>
            </div>
          )}
            </>
          )}
        </main>
      </div>
    </>
  );
}

declare global {
  interface Window {
    MathJax: {
      typesetPromise?: () => Promise<void>;
      startup?: {
        defaultReady: () => void;
      };
    };
  }
}
