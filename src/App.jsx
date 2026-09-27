import { useEffect, useMemo, useState } from "react";
import "./index.css";
import { parseQuestions } from "./parser";
// Vite's "?raw" import loads the file as a plain string at build time.
// This is the ONLY line that connects the app to your question bank.
import questionsText from "./questions.txt?raw";
 
function shuffledIndices(length) {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
 
export default function App() {
  // Parse the text file once. Editing questions.txt and rebuilding is all
  // that's ever needed — nothing below this line has to change.
  const parsedSets = useMemo(() => parseQuestions(questionsText), []);
 
  const [activeSet, setActiveSet] = useState(0);
  // Answers are keyed by each question's ORIGINAL index (its position in
  // parsedSets), not its on-screen position — so shuffling never
  // mismatches an answer with the wrong question.
  const [answersBySet, setAnswersBySet] = useState({});
  // Per-set display order. If a set has no entry here, it's shown in
  // original file order.
  const [orderBySet, setOrderBySet] = useState({});
 
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem("quizDarkMode") === "true";
    } catch {
      return false;
    }
  });
 
  useEffect(() => {
    try {
      localStorage.setItem("quizDarkMode", String(darkMode));
    } catch {
      // ignore storage errors (e.g. private browsing)
    }
  }, [darkMode]);
 
  const currentSet = parsedSets[activeSet] || { label: "No questions yet", questions: [] };
  const QUESTIONS = currentSet.questions;
  const answers = answersBySet[activeSet] || {};
 
  const order = orderBySet[activeSet] || QUESTIONS.map((_, i) => i);
 
  const handleSelect = (originalIndex, letter) => {
    if (answers[originalIndex]) return; // lock in the first answer
    setAnswersBySet((prev) => ({
      ...prev,
      [activeSet]: { ...(prev[activeSet] || {}), [originalIndex]: letter },
    }));
  };
 
  const handleShuffle = () => {
    setOrderBySet((prev) => ({
      ...prev,
      [activeSet]: shuffledIndices(QUESTIONS.length),
    }));
    setAnswersBySet((prev) => ({ ...prev, [activeSet]: {} }));
  };
 
  const handleReset = () => {
    setAnswersBySet((prev) => ({ ...prev, [activeSet]: {} }));
  };
 
  const answeredCount = Object.keys(answers).length;
  const correctCount = Object.entries(answers).filter(
    ([originalIndex, letter]) => QUESTIONS[originalIndex]?.correct === letter
  ).length;
  const progressPct = QUESTIONS.length > 0 ? Math.round((answeredCount / QUESTIONS.length) * 100) : 0;
 
  return (
    <div className={"page" + (darkMode ? " dark" : "")}>
      <header className="header">
        <div className="topRow">
          <h1>Quiz for my wifies 📖</h1>
          <button
            className="iconToggle"
            onClick={() => setDarkMode((d) => !d)}
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>
        <p className="subtitle">Goodluck minamahal kong napakaganda</p>
 
        {parsedSets.length > 1 && (
          <div className="setSwitcher">
            {parsedSets.map((set, i) => (
              <button
                key={i}
                className={"setButton" + (activeSet === i ? " setButtonActive" : "")}
                onClick={() => setActiveSet(i)}
              >
                {set.label}
              </button>
            ))}
          </div>
        )}
 
        {QUESTIONS.length > 0 && (
          <div className="controlsRow">
            <button className="ctrlButton" onClick={handleShuffle}>
              🔀 Shuffle
            </button>
            <button className="ctrlButton" onClick={handleReset} disabled={answeredCount === 0}>
              ↺ Reset
            </button>
          </div>
        )}
 
        {QUESTIONS.length > 0 && (
          <div className="progressWrap">
            <div className="progressTrack">
              <div className="progressFill" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="progressLabel">
              {answeredCount} / {QUESTIONS.length} answered ({progressPct}%)
            </div>
          </div>
        )}
 
        {QUESTIONS.length > 0 && answeredCount > 0 && (
          <div className="scoreBar">
            Score: <strong>{correctCount}</strong> / {answeredCount} answered
          </div>
        )}
      </header>
 
      <main>
        {QUESTIONS.length === 0 ? (
          <div className="emptySet">
            <h2>No questions here yet</h2>
            <p>Add some to questions.txt using the TERM / A-D / ANSWER / EXPLAIN pattern.</p>
          </div>
        ) : (
          order.map((originalIndex, displayIndex) => {
            const q = QUESTIONS[originalIndex];
            const selected = answers[originalIndex];
            const isAnswered = Boolean(selected);
            const isCorrect = selected === q.correct;
 
            return (
              <section
                className={"card" + (isAnswered ? (isCorrect ? " correctCard" : " wrongCard") : "")}
                key={originalIndex}
              >
                <div className="qNumber">Question {displayIndex + 1}</div>
                <p className="term">{q.term}</p>
 
                <div className="choices">
                  {["A", "B", "C", "D"].map((letter) => {
                    if (!q.choices[letter]) return null;
                    const isThisCorrect = letter === q.correct;
                    const isThisSelected = letter === selected;
 
                    let choiceClass = "choice";
                    if (isAnswered) {
                      if (isThisCorrect) choiceClass += " choiceCorrect";
                      else if (isThisSelected) choiceClass += " choiceWrong";
                      else choiceClass += " choiceDim";
                    }
 
                    return (
                      <button
                        key={letter}
                        className={choiceClass}
                        onClick={() => handleSelect(originalIndex, letter)}
                        disabled={isAnswered}
                      >
                        <span className="letter">{letter}</span>
                        <span className="choiceText">{q.choices[letter]}</span>
                      </button>
                    );
                  })}
                </div>
 
                {isAnswered && (
                  <div className="feedback">
                    {isCorrect ? (
                      <p className="feedbackCorrect">
                        ✅ Correct! <strong>{selected}</strong> — {q.explanations[selected]}
                      </p>
                    ) : (
                      <>
                        <p className="feedbackWrong">
                          ❌ <strong>Your answer: {selected}</strong> — {q.choices[selected]}
                        </p>
                        <p className="feedbackRight">
                          ✅ <strong>Correct answer: {q.correct}</strong> — {q.choices[q.correct]}
                        </p>
                        <p className="feedbackExplain">
                          <strong>Why:</strong> {q.explanations[q.correct]}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </section>
            );
          })
        )}
      </main>
 
      <footer className="footer">
        {QUESTIONS.length > 0 && (
          <p>
            {answeredCount === QUESTIONS.length
              ? `All done! Final score: ${correctCount} / ${QUESTIONS.length} 🎉`
              : `${QUESTIONS.length - answeredCount} question(s) left.`}
          </p>
        )}
      </footer>
    </div>
  );
}
 
