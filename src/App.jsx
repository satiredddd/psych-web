import { useMemo, useState } from "react";
import "./index.css";
import { parseQuestions } from "./parser";
// Vite's "?raw" import loads the file as a plain string at build time.
// This is the ONLY line that connects the app to your question bank.
import questionsText from "./questions.txt?raw";

export default function App() {
  // Parse the text file once. Editing questions.txt and rebuilding is all
  // that's ever needed — nothing below this line has to change.
  const parsedSets = useMemo(() => parseQuestions(questionsText), []);

  const [activeSet, setActiveSet] = useState(0);
  const [answersBySet, setAnswersBySet] = useState({});

  const currentSet = parsedSets[activeSet] || { label: "No questions yet", questions: [] };
  const QUESTIONS = currentSet.questions;
  const answers = answersBySet[activeSet] || {};

  const handleSelect = (qIndex, letter) => {
    if (answers[qIndex]) return; // lock in the first answer
    setAnswersBySet((prev) => ({
      ...prev,
      [activeSet]: { ...(prev[activeSet] || {}), [qIndex]: letter },
    }));
  };

  const answeredCount = Object.keys(answers).length;
  const correctCount = Object.entries(answers).filter(
    ([qIndex, letter]) => QUESTIONS[qIndex]?.correct === letter
  ).length;

  return (
    <div className="page">
      <header className="header">
        <h1>Quiz for my wifies 📖</h1>
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

        {QUESTIONS.length > 0 && answeredCount > 0 && (
          <div className="scoreBar">
            Score: <strong>{correctCount}</strong> / {answeredCount} answered
            {" "}(<span>{QUESTIONS.length} total</span>)
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
          QUESTIONS.map((q, qIndex) => {
            const selected = answers[qIndex];
            const isAnswered = Boolean(selected);
            const isCorrect = selected === q.correct;

            return (
              <section
                className={"card" + (isAnswered ? (isCorrect ? " correctCard" : " wrongCard") : "")}
                key={qIndex}
              >
                <div className="qNumber">Question {qIndex + 1}</div>
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
                        onClick={() => handleSelect(qIndex, letter)}
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
