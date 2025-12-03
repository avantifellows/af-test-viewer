import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.0-flash-001";

export async function POST(request: NextRequest) {
  try {
    const { questionText, passageText, options } = await request.json();

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
            content: `You are a very smart student, attempting the Joint Entrance Examination (JEE) Advanced of the Indian Institutes of Technology (IIT).

Read the instructions below carefully, and then answer the question.

IMPORTANT: Mathematical equations in the question are written in LaTeX notation (e.g., $x^2$ for inline math, $$E=mc^2$$ for display math). Parse and interpret them correctly.

The question may reference a diagram. If there is a discrepancy between the text and any diagram description, you should use the information from the text.

Remember that the questions are constructed very carefully, and do not contain any errors - so read the question carefully and answer the question as asked.

---

${questionContent}

---

Answer the question above.

Follow carefully any instructions given in the question.

Ensure that your solution ends with the sentence of the form:
'The correct answer is ...', where ... is your answer.

If the question is a multiple choice question, your answer should be the letter corresponding to the correct answer.`,
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
