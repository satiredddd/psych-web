import { useEffect, useMemo, useState } from "react";
import "./index.css";
import { parseQuestions } from "./parser";
// Kept only as the source for the one-time "Import existing questions"
// seed button below — the live app now reads from the shared function.
import bundledQuestionsText from "./questions.txt?raw";

const FUNCTION_URL = "/.netlify/functions/questions";

function shuffledIndices(length) {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const emptyForm = {
  set: "",
  term: "",
  a: "",
  b: "",
  c: "",
  d: "",
  correct: "A",
  explainA: "",
  explainB: "",
  explainC: "",
  explainD: "",
};

export default function App() {
  const [rawText, setRawText] = useState(null); // null = still loading
  const [loadError, setLoadError] = useState(null);

  const [activeSet, setActiveSet] = useState(0);
  const [answersBySet, setAnswersBySet] = useState({});
  const [orderBySet, setOrderBySet] = useState({});

  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem("quizDarkMode") === "true";
    } catch {
      return false;
    }
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [addMode, setAddMode] = useState("single"); // "single" | "bulk"
  const [form, setForm] = useState(emptyForm);
  const [bulkSet, setBulkSet] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const detectedCount = useMemo(
    () => (bulkText.match(/^TERM:/gim) || []).length,
    [bulkText]
  );
  const bulkHasSetLines = /^SET:/im.test(bulkText);

  useEffect(() => {
    try {
      localStorage.setItem("quizDarkMode", String(darkMode));
    } catch {
      // ignore storage errors (e.g. private browsing)
    }
  }, [darkMode]);

  const loadQuestions = () => {
    setLoadError(null);
    fetch(FUNCTION_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.text();
      })
      .then((text) => setRawText(text))
      .catch((err) => setLoadError(err.message || "Failed to load questions"));
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  const parsedSets = useMemo(() => parseQuestions(rawText || ""), [rawText]);

  const currentSet = parsedSets[activeSet] || { label: "No questions yet", questions: [] };
  const QUESTIONS = currentSet.questions;
  const answers = answersBySet[activeSet] || {};
  const order = orderBySet[activeSet] || QUESTIONS.map((_, i) => i);

  const handleSelect = (originalIndex, letter) => {
    if (answers[originalIndex]) return;
    setAnswersBySet((prev) => ({
      ...prev,
      [activeSet]: { ...(prev[activeSet] || {}), [originalIndex]: letter },
    }));
  };

  const handleShuffle = () => {
    setOrderBySet((prev) => ({ ...prev, [activeSet]: shuffledIndices(QUESTIONS.length) }));
    setAnswersBySet((prev) => ({ ...prev, [activeSet]: {} }));
  };

  const handleReset = () => {
    setAnswersBySet((prev) => ({ ...prev, [activeSet]: {} }));
  };

  const handleImportBundled = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(FUNCTION_URL, { method: "PUT", body: bundledQuestionsText });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const text = await res.text();
      setRawText(text);
    } catch (err) {
      setSaveError(err.message || "Import failed");
    } finally {
      setSaving(false);
    }
  };

  const openAddForm = () => {
    const label = currentSet.label !== "No questions yet" ? currentSet.label : "";
    setForm({ ...emptyForm, set: label });
    setBulkSet(label);
    setBulkText("");
    setAddMode("single");
    setSaveError(null);
    setShowAddForm(true);
  };

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  // Shared by both the single-question form and the bulk-paste form: sends
  // one or more already-formatted TERM/.../ANSWER/EXPLAIN blocks (separated
  // by "---" if there's more than one) to the target set.
  const saveBlock = async (set, block) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set, block }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const text = await res.text();
      setRawText(text);
      return true;
    } catch (err) {
      setSaveError(err.message || "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    if (!form.set.trim() || !form.term.trim() || !form.a.trim() || !form.b.trim()) {
      setSaveError("Set, term, and at least choices A and B are required.");
      return;
    }
    const block = [
      `TERM: ${form.term.trim()}`,
      `A) ${form.a.trim()}`,
      form.b.trim() && `B) ${form.b.trim()}`,
      form.c.trim() && `C) ${form.c.trim()}`,
      form.d.trim() && `D) ${form.d.trim()}`,
      `ANSWER: ${form.correct}`,
      form.explainA.trim() && `EXPLAIN A: ${form.explainA.trim()}`,
      form.explainB.trim() && `EXPLAIN B: ${form.explainB.trim()}`,
      form.explainC.trim() && `EXPLAIN C: ${form.explainC.trim()}`,
      form.explainD.trim() && `EXPLAIN D: ${form.explainD.trim()}`,
    ]
      .filter(Boolean)
      .join("\n");

    const ok = await saveBlock(form.set.trim(), block);
    if (ok) {
      setShowAddForm(false);
      setForm(emptyForm);
    }
  };

  const handleBulkAdd = async (e) => {
    e.preventDefault();
    if (!bulkSet.trim()) {
      setSaveError("Pick a set to add these questions to.");
      return;
    }
    if (bulkHasSetLines) {
      setSaveError("Remove any \"SET:\" lines from the pasted text — pick the set above instead.");
      return;
    }
    if (detectedCount === 0) {
      setSaveError("No questions detected. Check that each one has a TERM: line.");
      return;
    }
    const ok = await saveBlock(bulkSet.trim(), bulkText);
    if (ok) {
      setShowAddForm(false);
      setBulkText("");
    }
  };

  const answeredCount = Object.keys(answers).length;
  const correctCount = Object.entries(answers).filter(
    ([originalIndex, letter]) => QUESTIONS[originalIndex]?.correct === letter
  ).length;
  const progressPct = QUESTIONS.length > 0 ? Math.round((answeredCount / QUESTIONS.length) * 100) : 0;

  if (rawText === null && !loadError) {
    return (
      <div className={"page" + (darkMode ? " dark" : "")}>
        <div className="loadingState">Loading questions…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={"page" + (darkMode ? " dark" : "")}>
        <div className="loadingState">
          <p>Couldn't load questions: {loadError}</p>
          <button className="ctrlButton" onClick={loadQuestions}>
            Retry
          </button>
        </div>
      </div>
    );
  }

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

        <div className="controlsRow">
          {QUESTIONS.length > 0 && (
            <>
              <button className="ctrlButton" onClick={handleShuffle}>
                🔀 Shuffle
              </button>
              <button className="ctrlButton" onClick={handleReset} disabled={answeredCount === 0}>
                ↺ Reset
              </button>
            </>
          )}
          <button className="ctrlButton" onClick={openAddForm}>
            ＋ Add question
          </button>
        </div>

        {parsedSets.length === 0 && (
          <button className="ctrlButton" onClick={handleImportBundled} disabled={saving}>
            {saving ? "Importing…" : "Import existing questions.txt"}
          </button>
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

      {showAddForm && (
        <div className="modalOverlay" onClick={() => !saving && setShowAddForm(false)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <h2>Add question{addMode === "bulk" ? "s" : ""}</h2>

            <div className="modeTabs">
              <button
                type="button"
                className={"modeTab" + (addMode === "single" ? " modeTabActive" : "")}
                onClick={() => setAddMode("single")}
              >
                Single question
              </button>
              <button
                type="button"
                className={"modeTab" + (addMode === "bulk" ? " modeTabActive" : "")}
                onClick={() => setAddMode("bulk")}
              >
                Paste multiple
              </button>
            </div>

            {addMode === "single" ? (
              <form onSubmit={handleAddQuestion} className="modalForm">
                <label>
                  Set
                  <input value={form.set} onChange={(e) => updateField("set", e.target.value)} placeholder="e.g. Questions 1-80" />
                </label>
                <label>
                  Term / question
                  <textarea value={form.term} onChange={(e) => updateField("term", e.target.value)} rows={2} />
                </label>

                {["a", "b", "c", "d"].map((letter) => (
                  <label key={letter}>
                    Choice {letter.toUpperCase()}
                    <input value={form[letter]} onChange={(e) => updateField(letter, e.target.value)} />
                  </label>
                ))}

                <label>
                  Correct answer
                  <select value={form.correct} onChange={(e) => updateField("correct", e.target.value)}>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                </label>

                {["A", "B", "C", "D"].map((letter) => (
                  <label key={letter}>
                    Explanation {letter} (optional)
                    <input
                      value={form[`explain${letter}`]}
                      onChange={(e) => updateField(`explain${letter}`, e.target.value)}
                    />
                  </label>
                ))}

                {saveError && <p className="formError">{saveError}</p>}

                <div className="modalActions">
                  <button type="button" className="ctrlButton" onClick={() => setShowAddForm(false)} disabled={saving}>
                    Cancel
                  </button>
                  <button type="submit" className="ctrlButton ctrlButtonPrimary" disabled={saving}>
                    {saving ? "Saving…" : "Save question"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleBulkAdd} className="modalForm">
                <label>
                  Set (all pasted questions go here)
                  <input value={bulkSet} onChange={(e) => setBulkSet(e.target.value)} placeholder="e.g. Questions 1-80" />
                </label>
                <label>
                  Paste your questions
                  <textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    rows={12}
                    placeholder={
                      "TERM: What does X mean?\nA) Choice one\nB) Choice two\nC) Choice three\nD) Choice four\nANSWER: B\nEXPLAIN A: ...\nEXPLAIN B: ...\nEXPLAIN C: ...\nEXPLAIN D: ...\n---\nTERM: Next question...\n..."
                    }
                  />
                </label>
                <p className="bulkHint">
                  Same format as questions.txt, separated by <code>---</code>. Don't include{" "}
                  <code>SET:</code> lines here — pick the set above instead.
                </p>

                {bulkText.trim() !== "" && (
                  <p className={"detectedCount" + (detectedCount === 0 ? " detectedCountZero" : "")}>
                    {detectedCount === 0
                      ? "No questions detected yet"
                      : `Detected ${detectedCount} question${detectedCount === 1 ? "" : "s"}`}
                  </p>
                )}

                {saveError && <p className="formError">{saveError}</p>}

                <div className="modalActions">
                  <button type="button" className="ctrlButton" onClick={() => setShowAddForm(false)} disabled={saving}>
                    Cancel
                  </button>
                  <button type="submit" className="ctrlButton ctrlButtonPrimary" disabled={saving || detectedCount === 0}>
                    {saving ? "Saving…" : `Save ${detectedCount || ""} question${detectedCount === 1 ? "" : "s"}`}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <main>
        {QUESTIONS.length === 0 ? (
          <div className="emptySet">
            <h2>No questions here yet</h2>
            <p>Use "＋ Add question" above, or import your existing questions.txt.</p>
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