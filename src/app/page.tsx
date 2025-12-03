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
  answer?: string | string[] | number; // Can be array like ["1"], string like "A", or number
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

interface QuestionState {
  selectedAnswer?: string; // A, B, C, D
  submitted: boolean;
  hintsUsed: number;
  score: number;
  isCorrect?: boolean;
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

  // Test-taking state
  const [questionStates, setQuestionStates] = useState<Record<string, QuestionState>>({});
  const [testSubmitted, setTestSubmitted] = useState(false);

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

  // Re-typeset MathJax when test, solutions, questionStates, or activeTab change
  useEffect(() => {
    if (mathJaxReady && window.MathJax) {
      window.MathJax.typesetPromise?.();
    }
  }, [test, solutions, questionStates, activeTab, mathJaxReady]);

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
    setQuestionStates({});
    setTestSubmitted(false);

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

  // Select an answer for a question
  const selectAnswer = (problemKey: string, answer: string) => {
    if (testSubmitted || questionStates[problemKey]?.submitted) return;
    setQuestionStates((prev) => ({
      ...prev,
      [problemKey]: {
        ...prev[problemKey],
        selectedAnswer: answer,
        submitted: false,
        hintsUsed: prev[problemKey]?.hintsUsed || 0,
        score: 0,
      },
    }));
  };

  // Helper to get correct answer letter from problem
  // CMS uses 1-indexed answers: ["1"] = A, ["2"] = B, etc.
  const getCorrectAnswer = (problem: Problem): string => {
    const rawAnswer = Array.isArray(problem.answer) ? problem.answer[0] : problem.answer;
    if (typeof rawAnswer === 'number' || !isNaN(Number(rawAnswer))) {
      const num = Number(rawAnswer);
      // CMS uses 1-indexed, so 1->A, 2->B, etc.
      return String.fromCharCode(64 + num); // 64 + 1 = 65 = 'A'
    }
    return String(rawAnswer || '').toUpperCase().trim();
  };

  // Submit a single question
  const submitQuestion = (problemKey: string, problem: Problem) => {
    const state = questionStates[problemKey];
    if (!state?.selectedAnswer || state.submitted) return;

    const correctAnswer = getCorrectAnswer(problem);
    const isCorrect = state.selectedAnswer === correctAnswer;

    // Calculate score: +4 for correct, -1 per hint, minimum 0
    let score = 0;
    if (isCorrect) {
      score = Math.max(0, 4 - (state.hintsUsed || 0));
    }

    setQuestionStates((prev) => ({
      ...prev,
      [problemKey]: {
        ...prev[problemKey],
        submitted: true,
        isCorrect,
        score,
      },
    }));
  };

  // Submit the entire test
  const submitTest = () => {
    setTestSubmitted(true);
  };

  // Calculate total score
  const calculateTotalScore = () => {
    return Object.values(questionStates).reduce((total, state) => {
      return total + (state.submitted ? state.score : 0);
    }, 0);
  };

  // Count answered questions
  const countAnsweredQuestions = () => {
    return Object.values(questionStates).filter((s) => s.submitted).length;
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

      // Track hints used for scoring
      setQuestionStates((prev) => ({
        ...prev,
        [problemKey]: {
          ...prev[problemKey],
          hintsUsed: (prev[problemKey]?.hintsUsed || 0) + 1,
          submitted: prev[problemKey]?.submitted || false,
          score: prev[problemKey]?.score || 0,
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
              <div className="flex justify-between border-b border-gray-300 pb-4 mb-4">
                <span className="text-gray-700">
                  Duration: {test.duration} minutes
                </span>
                <span className="text-gray-700">Total Marks: {test.marks}</span>
              </div>

              {/* Score Display */}
              <div className={`p-4 rounded-lg mb-6 ${testSubmitted ? 'bg-blue-100 border-2 border-blue-500' : 'bg-gray-100 border border-gray-300'}`}>
                <div className="flex justify-between items-center">
                  <div className="flex gap-6">
                    <div>
                      <span className="text-gray-600 text-sm">Score:</span>
                      <span className="ml-2 text-2xl font-bold text-blue-600">{calculateTotalScore()}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 text-sm">Answered:</span>
                      <span className="ml-2 text-lg font-semibold text-gray-800">{countAnsweredQuestions()}</span>
                    </div>
                  </div>
                  {testSubmitted && (
                    <span className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">
                      Test Submitted
                    </span>
                  )}
                </div>
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
                    const qState = questionStates[problemKey];
                    const isQuestionSubmitted = qState?.submitted || testSubmitted;

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
                                <div className="grid grid-cols-1 gap-2 mt-3">
                                  {problem.options.map((option, optIdx) => {
                                    const optionLetter = String.fromCharCode(65 + optIdx);
                                    const isSelected = qState?.selectedAnswer === optionLetter;
                                    const correctAnswer = getCorrectAnswer(problem);
                                    const isCorrectOption = optionLetter === correctAnswer;
                                    const showResult = isQuestionSubmitted && qState?.submitted;

                                    let optionClasses = "flex gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ";

                                    if (showResult) {
                                      // After submission - show correct/incorrect
                                      if (isCorrectOption) {
                                        optionClasses += "bg-green-100 border-green-500 ";
                                      } else if (isSelected && !isCorrectOption) {
                                        optionClasses += "bg-red-100 border-red-500 ";
                                      } else {
                                        optionClasses += "bg-gray-50 border-gray-200 ";
                                      }
                                      optionClasses += "cursor-default ";
                                    } else if (isSelected) {
                                      optionClasses += "bg-blue-100 border-blue-500 ";
                                    } else {
                                      optionClasses += "bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50 ";
                                    }

                                    return (
                                      <div
                                        key={optIdx}
                                        onClick={() => !isQuestionSubmitted && selectAnswer(problemKey, optionLetter)}
                                        className={optionClasses}
                                      >
                                        <span className={`font-semibold ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>
                                          {optionLetter}.
                                        </span>
                                        <span
                                          className="text-gray-800 flex-1"
                                          dangerouslySetInnerHTML={{
                                            __html: option.text,
                                          }}
                                        />
                                        {showResult && isCorrectOption && (
                                          <span className="text-green-600 font-semibold">✓</span>
                                        )}
                                        {showResult && isSelected && !isCorrectOption && (
                                          <span className="text-red-600 font-semibold">✗</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="mt-4 space-y-3">
                          {/* Submit and Hint buttons (before submission) */}
                          {!isQuestionSubmitted && problem.options && problem.options.length > 0 && (
                            <div className="flex gap-2 items-center">
                              <button
                                onClick={() => submitQuestion(problemKey, problem)}
                                disabled={!qState?.selectedAnswer}
                                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                              >
                                Submit Answer
                              </button>
                              <button
                                onClick={() => generateHint(problemKey, problem)}
                                disabled={solutionState?.hintLoading}
                                className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:bg-yellow-300 transition-colors text-sm"
                              >
                                {solutionState?.hintLoading
                                  ? "Generating..."
                                  : solutionState?.aiHints?.length
                                  ? `Get Another Hint (${solutionState.aiHints.length} used, -${solutionState.aiHints.length} pts)`
                                  : "Get Hint (-1 pt)"}
                              </button>
                            </div>
                          )}

                          {/* Result display (after submission) */}
                          {qState?.submitted && (
                            <div className={`p-3 rounded-lg ${qState.isCorrect ? 'bg-green-100 border border-green-300' : 'bg-red-100 border border-red-300'}`}>
                              <div className="flex items-center gap-3">
                                <span className={`text-lg font-bold ${qState.isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                                  {qState.isCorrect ? '✓ Correct!' : '✗ Incorrect'}
                                </span>
                                <span className="text-gray-700">
                                  Score: <strong className="text-blue-600">+{qState.score}</strong>
                                  {qState.hintsUsed > 0 && (
                                    <span className="text-gray-500 text-sm ml-2">
                                      ({qState.hintsUsed} hint{qState.hintsUsed > 1 ? 's' : ''} used)
                                    </span>
                                  )}
                                </span>
                                {!qState.isCorrect && (
                                  <span className="text-gray-600">
                                    Correct answer: <strong>{getCorrectAnswer(problem)}</strong>
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Generate Solution button (after submission) */}
                          {isQuestionSubmitted && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => generateSolution(problemKey, problem)}
                                disabled={solutionState?.solutionLoading}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-300 transition-colors text-sm"
                              >
                                {solutionState?.solutionLoading
                                  ? "Generating..."
                                  : solutionState?.aiSolution
                                  ? "Regenerate AI Solution"
                                  : "Generate AI Solution"}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Hints Display (visible before and after submission) */}
                        {(solutionState?.aiHints?.length > 0 || solutionState?.hintLoading) && (
                          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <h4 className="font-semibold text-yellow-800 mb-2">
                              AI Hints ({solutionState.aiHints?.length || 0})
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
                            ) : null}
                          </div>
                        )}

                        {/* Solutions Display (only after submission) */}
                        {isQuestionSubmitted && (
                          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                              {solutionState?.solutionLoading ? (
                                <div className="flex items-center gap-2 text-gray-500">
                                  <div className="animate-spin h-4 w-4 border-2 border-green-600 border-t-transparent rounded-full"></div>
                                  <span className="text-sm">Generating solution...</span>
                                </div>
                              ) : solutionState?.solutionError ? (
                                <p className="text-red-600 text-sm">
                                  {solutionState.solutionError}
                                </p>
                              ) : solutionState?.aiSolution ? (
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
                                  Click &quot;Generate AI Solution&quot; to get AI solution
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Submit Test Button */}
              {!testSubmitted && (
                <div className="mt-8 p-6 bg-gray-100 rounded-lg border-2 border-gray-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">Ready to submit?</h3>
                      <p className="text-gray-600 text-sm">
                        You have answered {countAnsweredQuestions()} questions.
                        Current score: {calculateTotalScore()} points.
                      </p>
                    </div>
                    <button
                      onClick={submitTest}
                      className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-lg"
                    >
                      Submit Test
                    </button>
                  </div>
                </div>
              )}

              {/* Final Score Display (after test submission) */}
              {testSubmitted && (
                <div className="mt-8 p-6 bg-blue-100 rounded-lg border-2 border-blue-500">
                  <div className="text-center">
                    <h3 className="text-2xl font-bold text-blue-800 mb-2">Test Completed!</h3>
                    <p className="text-4xl font-bold text-blue-600 mb-2">{calculateTotalScore()} points</p>
                    <p className="text-gray-600">
                      You answered {countAnsweredQuestions()} questions.
                      Review the solutions above for each question.
                    </p>
                  </div>
                </div>
              )}

              {/* Back button */}
              <button
                onClick={() => {
                  setTest(null);
                  setSolutions({});
                  setQuestionStates({});
                  setTestSubmitted(false);
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
