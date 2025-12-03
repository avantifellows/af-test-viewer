import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.0-flash-001";

const DEFAULT_SOLUTION_PROMPT = `You are a very smart student, attempting the Joint Entrance Examination (JEE) Advanced of the Indian Institutes of Technology (IIT).

Read the instructions below carefully, and then answer the question.

IMPORTANT: Mathematical equations in the question are written in LaTeX notation (e.g., $x^2$ for inline math, $$E=mc^2$$ for display math). Parse and interpret them correctly.

The question may reference a diagram. If there is a discrepancy between the text and any diagram description, you should use the information from the text.

Remember that the questions are constructed very carefully, and do not contain any errors - so read the question carefully and answer the question as asked.

---

{{QUESTION_CONTENT}}

---

Answer the question above.

Follow carefully any instructions given in the question.

Ensure that your solution ends with the sentence of the form:
'The correct answer is ...', where ... is your answer.

If the question is a multiple choice question, your answer should be the letter corresponding to the correct answer.`;

const DEFAULT_HINT_PROMPT = `You are a very smart student, attempting the Joint Entrance Examination (JEE) Advanced of the Indian Institutes of Technology (IIT).

Read the instructions below carefully, provide one hint that would allow reattempting the question. DO NOT PROVIDE THE ANSWER. The goal of the hint is to tell the student specific and sharp problem solving steps - focus on these and not on explaining theory. After each hint show one step of the solution.

IMPORTANT: Mathematical equations in the question are written in LaTeX notation (e.g., $x^2$ for inline math, $E=mc^2$ for display math). Parse and interpret them correctly.

The question may reference a diagram. If there is a discrepancy between the text and any diagram description, you should use the information from the text.

Remember that the questions are constructed very carefully, and do not contain any errors - so read the question and follow instructions very carefully.

---

{{QUESTION_CONTENT}}

---

{{HINT_INSTRUCTIONS}}`;

export async function GET() {
  return NextResponse.json({
    defaultSolutionPrompt: DEFAULT_SOLUTION_PROMPT,
    defaultHintPrompt: DEFAULT_HINT_PROMPT,
  });
}

export async function POST(request: NextRequest) {
  try {
    const { questionText, passageText, options, customPrompt, type, previousHints } = await request.json();

    if (!questionText) {
      return NextResponse.json({ error: "Question text is required" }, { status: 400 });
    }

    // Build the question content
    let questionContent = "";

    if (passageText) {
      questionContent += `**Passage:**\n${passageText}\n\n`;
    }

    questionContent += `**Question:**\n${questionText}\n\n`;

    if (options && options.length > 0) {
      questionContent += "**Options:**\n";
      options.forEach((opt: { text: string }, idx: number) => {
        questionContent += `${String.fromCharCode(65 + idx)}. ${opt.text}\n`;
      });
    }

    // Use custom prompt or default based on type, replacing placeholder with question content
    const defaultPrompt = type === "hint" ? DEFAULT_HINT_PROMPT : DEFAULT_SOLUTION_PROMPT;
    const promptTemplate = customPrompt || defaultPrompt;

    // Build hint instructions section (conditional based on previous hints)
    let hintInstructions = "";
    if (previousHints && previousHints.length > 0) {
      hintInstructions = "Previously given hints:\n" +
        previousHints.map((hint: string, idx: number) => `Hint ${idx + 1}: ${hint}`).join("\n") +
        "\n\nProvide the next hint that builds on the previous hints above. Make it progressively more specific and detailed. Do NOT repeat information already given. Do NOT reveal the final answer.";
    } else {
      hintInstructions = "Provide a helpful hint to guide toward solving this problem. Do NOT reveal the final answer.";
    }

    const finalPrompt = promptTemplate
      .replace("{{QUESTION_CONTENT}}", questionContent)
      .replace("{{HINT_INSTRUCTIONS}}", hintInstructions)
      .replace("{{PREVIOUS_HINTS}}", hintInstructions); // Backward compatibility

    console.log("Type:", type, "Using custom prompt:", !!customPrompt, "Previous hints:", previousHints?.length || 0);
    console.log("Prompt preview:", finalPrompt.substring(0, 200));

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Test Viewer",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: finalPrompt,
          },
        ],
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter error:", errorText);
      throw new Error(`OpenRouter returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log("OpenRouter response:", JSON.stringify(data, null, 2));

    // Gemini 3 returns solution in 'reasoning' field if 'content' is empty
    const message = data.choices?.[0]?.message;
    const solution = message?.content || message?.reasoning || "No solution generated";
    console.log("Extracted solution:", solution?.substring(0, 100));

    return NextResponse.json({ solution });
  } catch (error) {
    console.error("Error generating solution:", error);
    return NextResponse.json(
      { error: "Failed to generate solution" },
      { status: 500 }
    );
  }
}
