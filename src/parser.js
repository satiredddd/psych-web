/**
 * PARSER — turns a plain-text question bank into the data structure the app needs.
 *
 * FORMAT YOU WRITE IN (questions.txt):
 * ------------------------------------------------------------
 * SET: Questions 1-80
 * TERM: What does X mean?
 * A) Choice one
 * B) Choice two
 * C) Choice three
 * D) Choice four
 * ANSWER: B
 * EXPLAIN A: why A is wrong
 * EXPLAIN B: why B is right
 * EXPLAIN C: why C is wrong
 * EXPLAIN D: why D is wrong
 * ---
 * TERM: Next question...
 * A) ...
 * B) ...
 * C) ...
 * D) ...
 * ANSWER: C
 * EXPLAIN A: ...
 * EXPLAIN B: ...
 * EXPLAIN C: ...
 * EXPLAIN D: ...
 * ---
 * SET: Questions 81-130
 * TERM: ...
 * ------------------------------------------------------------
 *
 * RULES:
 * - "SET: <label>" starts a new page/tab of questions. Everything after it
 *   belongs to that set, until the next "SET:" line or the end of the file.
 * - "---" on its own line ends one question and starts the next.
 * - TERM / A) B) C) D) / EXPLAIN A-D can wrap onto multiple lines — just keep
 *   typing on the next line without a new marker, and it gets joined on.
 * - Blank lines are ignored, so you can space things out however you like.
 * - Order of A)/B)/C)/D) and EXPLAIN lines doesn't matter, letters do.
 * - A block missing a TERM or ANSWER is silently skipped (so one typo doesn't
 *   crash the whole app) — check the console warning if a question goes missing.
 */

function parseBlock(lines, blockNumberForWarning) {
  const q = {
    term: "",
    choices: { A: "", B: "", C: "", D: "" },
    correct: "",
    explanations: { A: "", B: "", C: "", D: "" },
  };

  let current = null; // tracks which field continuation lines should attach to

  for (const rawLine of lines) {
    const line = rawLine;

    const termMatch = line.match(/^TERM:\s*(.*)$/i);
    const choiceMatch = line.match(/^([A-D])\)\s*(.*)$/i);
    const answerMatch = line.match(/^ANSWER:\s*([A-D])/i);
    const explainMatch = line.match(/^EXPLAIN\s*([A-D]):\s*(.*)$/i);

    if (termMatch) {
      current = { type: "term" };
      q.term = termMatch[1].trim();
    } else if (choiceMatch) {
      const letter = choiceMatch[1].toUpperCase();
      current = { type: "choice", letter };
      q.choices[letter] = choiceMatch[2].trim();
    } else if (answerMatch) {
      current = null;
      q.correct = answerMatch[1].toUpperCase();
    } else if (explainMatch) {
      const letter = explainMatch[1].toUpperCase();
      current = { type: "explain", letter };
      q.explanations[letter] = explainMatch[2].trim();
    } else if (line.trim() !== "") {
      // continuation of whatever field we were last filling in
      const text = line.trim();
      if (current?.type === "term") {
        q.term = q.term ? q.term + " " + text : text;
      } else if (current?.type === "choice") {
        q.choices[current.letter] = q.choices[current.letter]
          ? q.choices[current.letter] + " " + text
          : text;
      } else if (current?.type === "explain") {
        q.explanations[current.letter] = q.explanations[current.letter]
          ? q.explanations[current.letter] + " " + text
          : text;
      }
    }
  }

  if (!q.term || !q.correct) {
    console.warn(
      `[questions.txt] Skipped block #${blockNumberForWarning} — missing TERM or ANSWER.`,
      q
    );
    return null;
  }
  return q;
}

export function parseQuestions(rawText) {
  const lines = rawText.split(/\r?\n/);
  const sets = [];
  let currentSet = null;
  let block = [];
  let blockCount = 0;

  const flushBlock = () => {
    const hasContent = block.some((l) => l.trim() !== "");
    if (!hasContent) {
      block = [];
      return;
    }
    blockCount += 1;
    const q = parseBlock(block, blockCount);
    if (q) {
      if (!currentSet) {
        currentSet = { label: "Questions", questions: [] };
        sets.push(currentSet);
      }
      currentSet.questions.push(q);
    }
    block = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.toUpperCase().startsWith("SET:")) {
      flushBlock();
      const label = line.slice(4).trim();
      currentSet = { label, questions: [] };
      sets.push(currentSet);
      continue;
    }

    if (line === "---") {
      flushBlock();
      continue;
    }

    block.push(rawLine);
  }
  flushBlock(); // catch a trailing block with no final "---"

  return sets;
}
