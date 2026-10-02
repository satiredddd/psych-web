import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import "./index.css";
import { parseQuestions } from "./parser";
import { db } from "./firebase";

const PERIODS = ["Prelim", "Midterm", "Finals"];

// Clean stroke icons (Lucide-style), drawn inline so they inherit text color.
const ICONS = {
  menu: (<><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>),
  x: (<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>),
  moon: (<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></>),
  shuffle: (<><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" /><path d="m18 2 4 4-4 4" /><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" /><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" /><path d="m18 14 4 4-4 4" /></>),
  reset: (<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></>),
  plus: (<><path d="M5 12h14" /><path d="M12 5v14" /></>),
  trash: (<><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><path d="M10 11v6" /><path d="M14 11v6" /></>),
  folder: (<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />),
  file: (<><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></>),
  library: (<><path d="m16 6 4 14" /><path d="M12 6v14" /><path d="M8 8v12" /><path d="M4 4v16" /></>),
  pencil: (<><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></>),
  chevronDown: (<path d="m6 9 6 6 6-6" />),
  chevronRight: (<path d="m9 18 6-6-6-6" />),
  checkCircle: (<><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></>),
  xCircle: (<><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></>),
  alertCircle: (<><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></>),
  check: (<path d="M20 6 9 17l-5-5" />),
  merge: (<><path d="m8 6 4-4 4 4" /><path d="M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22" /><path d="m20 22-5-5" /></>),
};

function Icon({ name, size = 18, className = "" }) {
  return (
    <svg
      className={"icon " + className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

const LETTERS = ["A", "B", "C", "D"];

function shuffleArray(input) {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shuffledIndices(length) {
  return shuffleArray(Array.from({ length }, (_, i) => i));
}

// "All of the above", "Both A and B", etc. break if reordered, so leave those alone.
const ORDER_DEPENDENT = /\b(all|none|both|either)\b.*\b(above|these|choices)\b|\b[A-D]\s*(and|&|,|or)\s*[A-D]\b/i;

// A questionnaire's stored text has no SET: lines, so parseQuestions always
// hands back a single set — this just unwraps its question list.
function questionsIn(text) {
  return parseQuestions(text || "")[0]?.questions || [];
}

// Splits stored text into its "---"-separated blocks (same rule as the parser).
function splitBlocks(text) {
  return (text || "")
    .split(/^[ \t\r]*---[ \t\r]*$/m)
    .map((b) => b.trim())
    .filter(Boolean);
}

// Positions (in splitBlocks order) of the blocks that parse into a real
// question, so the Nth displayed question maps back to its block.
function validBlockPositions(blocks) {
  const positions = [];
  blocks.forEach((b, i) => {
    if (questionsIn(b).length === 1) positions.push(i);
  });
  return positions;
}

const emptyForm = {
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
  // Firestore layout:
  //   subjects/{id}        -> { name, createdAt }
  //   questionnaires/{id}  -> { subjectId, period, name, text, createdAt }
  const [subjectsRaw, setSubjectsRaw] = useState(null); // null = loading
  const [questionnairesRaw, setQuestionnairesRaw] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  // Sidebar browsing location (independent from which questionnaire is open
  // for quiz-taking, so reopening the sidebar returns to the same folder).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navSubjectId, setNavSubjectId] = useState(null);
  const [navPeriod, setNavPeriod] = useState(null);

  // The questionnaire currently shown in the main quiz view.
  const [openRef, setOpenRef] = useState(null); // { subjectId, periodName, questionnaireId }

  const [answersByQ, setAnswersByQ] = useState({});
  const [orderByQ, setOrderByQ] = useState({});
  // Per-question display order of choice letters, e.g. { [qKey]: { [originalIndex]: ["C","A","D","B"] } }
  const [choiceOrderByQ, setChoiceOrderByQ] = useState({});

  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem("quizDarkMode") === "true";
    } catch {
      return false;
    }
  });

  const [showNewSubject, setShowNewSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [editSubject, setEditSubject] = useState(null); // subject being renamed
  const [editSubjectName, setEditSubjectName] = useState("");

  // Unified "add questions" modal, used both to create a new questionnaire
  // file (modalTarget.type === "new") and to append more questions to the
  // currently open one (modalTarget.type === "append").
  const [modalTarget, setModalTarget] = useState(null);
  const [qFormName, setQFormName] = useState("");
  const [addMode, setAddMode] = useState("single");
  const [form, setForm] = useState(emptyForm);
  const [bulkText, setBulkText] = useState("");

  const [confirmDeleteSubject, setConfirmDeleteSubject] = useState(null);
  const [confirmDeleteQuestionnaire, setConfirmDeleteQuestionnaire] = useState(null);

  // Editing: { type: "raw" } edits the whole text + name;
  // { type: "question", index, term } edits one question via the form fields.
  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState("");
  const [editText, setEditText] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Combine mode (sidebar): tick several questionnaires in a period and merge
  // them into a brand-new one. The originals are left untouched.
  const [combineMode, setCombineMode] = useState(false);
  const [combineSelected, setCombineSelected] = useState([]);
  const [showCombineModal, setShowCombineModal] = useState(false);
  const [combineName, setCombineName] = useState("");

  useEffect(() => {
    if (!sidebarOpen) {
      setCombineMode(false);
      setCombineSelected([]);
    }
  }, [sidebarOpen]);

  // Floating buttons: show the menu button once you've scrolled past the header,
  // and cycle through wrong answers when the "review" button is tapped.
  const [scrolled, setScrolled] = useState(false);
  const [jumpCursor, setJumpCursor] = useState(0);
  const [flashIndex, setFlashIndex] = useState(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 180);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const detectedCount = useMemo(() => (bulkText.match(/^TERM:/gim) || []).length, [bulkText]);
  const bulkHasSetLines = /^SET:/im.test(bulkText);

  useEffect(() => {
    try {
      localStorage.setItem("quizDarkMode", String(darkMode));
    } catch {
      // ignore storage errors (e.g. private browsing)
    }
  }, [darkMode]);

  // Realtime listeners: any change (yours or hers) shows up instantly.
  useEffect(() => {
    setLoadError(null);
    const onError = (err) => setLoadError(err.message || "Failed to load library");

    const unsubSubjects = onSnapshot(
      collection(db, "subjects"),
      (snap) => setSubjectsRaw(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      onError
    );
    const unsubQuestionnaires = onSnapshot(
      collection(db, "questionnaires"),
      (snap) => setQuestionnairesRaw(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      onError
    );

    return () => {
      unsubSubjects();
      unsubQuestionnaires();
    };
  }, [retryKey]);

  // Rebuild the Subjects > Periods > Questionnaires tree the UI expects.
  const library = useMemo(() => {
    if (subjectsRaw === null || questionnairesRaw === null) return null;
    const byCreated = (a, b) => (a.createdAt || 0) - (b.createdAt || 0);
    const subjects = [...subjectsRaw].sort(byCreated).map((s) => ({
      id: s.id,
      name: s.name,
      periods: PERIODS.map((periodName) => ({
        name: periodName,
        questionnaires: questionnairesRaw
          .filter((q) => q.subjectId === s.id && q.period === periodName)
          .sort(byCreated),
      })),
    }));
    return { subjects };
  }, [subjectsRaw, questionnairesRaw]);

  const currentSubject = library?.subjects.find((s) => s.id === navSubjectId) || null;
  const currentPeriod = currentSubject?.periods.find((p) => p.name === navPeriod) || null;

  // Selected questionnaires, kept in the same order they appear in the sidebar.
  const combinePicked = (currentPeriod?.questionnaires || []).filter((q) => combineSelected.includes(q.id));
  const combineQuestionTotal = combinePicked.reduce((sum, q) => sum + questionsIn(q.text).length, 0);

  const openSubject = library?.subjects.find((s) => s.id === openRef?.subjectId) || null;
  const openPeriod = openSubject?.periods.find((p) => p.name === openRef?.periodName) || null;
  const openQuestionnaire = openPeriod?.questionnaires.find((q) => q.id === openRef?.questionnaireId) || null;

  const QUESTIONS = useMemo(() => questionsIn(openQuestionnaire?.text), [openQuestionnaire]);
  const qKey = openRef?.questionnaireId || "__none__";
  const answers = answersByQ[qKey] || {};
  const storedOrder = orderByQ[qKey];
  // If questions were added after shuffling, the saved order is stale — fall back.
  const order =
    storedOrder && storedOrder.length === QUESTIONS.length ? storedOrder : QUESTIONS.map((_, i) => i);

  const handleSelect = (originalIndex, letter) => {
    if (answers[originalIndex]) return;
    setAnswersByQ((prev) => ({ ...prev, [qKey]: { ...(prev[qKey] || {}), [originalIndex]: letter } }));
  };

  const handleShuffleQuestions = () => {
    setOrderByQ((prev) => ({ ...prev, [qKey]: shuffledIndices(QUESTIONS.length) }));
    setAnswersByQ((prev) => ({ ...prev, [qKey]: {} }));
  };

  const handleShuffleChoices = () => {
    setChoiceOrderByQ((prev) => ({
      ...prev,
      [qKey]: Object.fromEntries(
        QUESTIONS.map((q, i) => {
          const available = LETTERS.filter((l) => q.choices[l]);
          const locked = available.some((l) => ORDER_DEPENDENT.test(q.choices[l]));
          return [i, locked ? available : shuffleArray(available)];
        })
      ),
    }));
    setAnswersByQ((prev) => ({ ...prev, [qKey]: {} }));
  };

  const handleReset = () => {
    setAnswersByQ((prev) => ({ ...prev, [qKey]: {} }));
  };

  const exitCombine = () => {
    setCombineMode(false);
    setCombineSelected([]);
  };

  const toggleCombine = (id) =>
    setCombineSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const openFolder = (subjectId, periodName) => {
    exitCombine();
    setNavSubjectId(subjectId);
    setNavPeriod(periodName);
  };

  const goToRoot = () => {
    exitCombine();
    setNavSubjectId(null);
    setNavPeriod(null);
  };

  const handleCombine = async (e) => {
    e.preventDefault();
    if (!combineName.trim()) {
      setSaveError("Give the combined questionnaire a name.");
      return;
    }
    const text = combinePicked
      .map((q) => (q.text || "").trim())
      .filter(Boolean)
      .join("\n---\n");
    if (combinePicked.length < 2 || !text) {
      setSaveError("Pick at least two questionnaires that have questions.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const ref = await addDoc(collection(db, "questionnaires"), {
        subjectId: currentSubject.id,
        period: currentPeriod.name,
        name: combineName.trim(),
        text,
        createdAt: Date.now(),
      });
      setOpenRef({
        subjectId: currentSubject.id,
        periodName: currentPeriod.name,
        questionnaireId: ref.id,
      });
      setShowCombineModal(false);
      setCombineName("");
      exitCombine();
      setSidebarOpen(false);
    } catch (err) {
      setSaveError(err.message || "Combine failed");
    } finally {
      setSaving(false);
    }
  };

  const handleAddSubject = async (e) => {
    e.preventDefault();
    if (!newSubjectName.trim()) {
      setSaveError("Name is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await addDoc(collection(db, "subjects"), {
        name: newSubjectName.trim(),
        createdAt: Date.now(),
      });
      setShowNewSubject(false);
      setNewSubjectName("");
    } catch (err) {
      setSaveError(err.message || "Failed to add subject");
    } finally {
      setSaving(false);
    }
  };

  const handleRenameSubject = async (e) => {
    e.preventDefault();
    if (!editSubjectName.trim()) {
      setSaveError("Name is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateDoc(doc(db, "subjects", editSubject.id), { name: editSubjectName.trim() });
      setEditSubject(null);
    } catch (err) {
      setSaveError(err.message || "Rename failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubject = async (subject) => {
    setSaving(true);
    try {
      // Delete the subject and every questionnaire inside it in one batch.
      const snap = await getDocs(query(collection(db, "questionnaires"), where("subjectId", "==", subject.id)));
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(doc(db, "subjects", subject.id));
      await batch.commit();

      if (navSubjectId === subject.id) goToRoot();
      if (openRef?.subjectId === subject.id) setOpenRef(null);
      setConfirmDeleteSubject(null);
    } catch (err) {
      alert(err.message || "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestionnaire = async ({ questionnaire }) => {
    setSaving(true);
    try {
      await deleteDoc(doc(db, "questionnaires", questionnaire.id));
      if (openRef?.questionnaireId === questionnaire.id) setOpenRef(null);
      setConfirmDeleteQuestionnaire(null);
    } catch (err) {
      alert(err.message || "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const openCreateModal = (subjectId, periodName) => {
    setModalTarget({ type: "new", subjectId, periodName });
    setQFormName("");
    setAddMode("single");
    setForm(emptyForm);
    setBulkText("");
    setSaveError(null);
  };

  const openAppendModal = () => {
    if (!openRef) return;
    setModalTarget({ type: "append", ...openRef });
    setAddMode("single");
    setForm(emptyForm);
    setBulkText("");
    setSaveError(null);
  };

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const buildSingleBlock = () => {
    if (!form.term.trim() || !form.a.trim() || !form.b.trim()) return null;
    return [
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
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    if (modalTarget.type === "new" && !qFormName.trim()) {
      setSaveError("Give this questionnaire a name.");
      return;
    }

    let block;
    if (addMode === "single") {
      block = buildSingleBlock();
      if (!block) {
        setSaveError("Term, and at least choices A and B, are required.");
        return;
      }
    } else {
      if (bulkHasSetLines) {
        setSaveError('Remove any "SET:" lines from the pasted text — they\'re not used anymore.');
        return;
      }
      if (detectedCount === 0) {
        setSaveError("No questions detected. Check that each one has a TERM: line.");
        return;
      }
      block = bulkText.trim();
    }

    setSaving(true);
    setSaveError(null);
    try {
      if (modalTarget.type === "new") {
        const ref = await addDoc(collection(db, "questionnaires"), {
          subjectId: modalTarget.subjectId,
          period: modalTarget.periodName,
          name: qFormName.trim(),
          text: block,
          createdAt: Date.now(),
        });
        setOpenRef({
          subjectId: modalTarget.subjectId,
          periodName: modalTarget.periodName,
          questionnaireId: ref.id,
        });
        setSidebarOpen(false);
      } else {
        // Transaction so two people appending at once never overwrite each other.
        const ref = doc(db, "questionnaires", modalTarget.questionnaireId);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new Error("This questionnaire no longer exists.");
          const existing = (snap.data().text || "").trim();
          tx.update(ref, { text: existing ? existing + "\n---\n" + block : block });
        });
      }
      setModalTarget(null);
    } catch (err) {
      setSaveError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const openRawEdit = () => {
    if (!openQuestionnaire) return;
    setEditTarget({ type: "raw" });
    setEditName(openQuestionnaire.name);
    setEditText(openQuestionnaire.text || "");
    setSaveError(null);
  };

  const openQuestionEdit = (index) => {
    const q = QUESTIONS[index];
    if (!q) return;
    setForm({
      term: q.term,
      a: q.choices.A,
      b: q.choices.B,
      c: q.choices.C,
      d: q.choices.D,
      correct: q.correct,
      explainA: q.explanations.A,
      explainB: q.explanations.B,
      explainC: q.explanations.C,
      explainD: q.explanations.D,
    });
    setEditTarget({ type: "question", index, term: q.term });
    setSaveError(null);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!openRef) return;
    const ref = doc(db, "questionnaires", openRef.questionnaireId);

    setSaving(true);
    setSaveError(null);
    try {
      if (editTarget.type === "raw") {
        if (!editName.trim()) throw new Error("Name can't be empty.");
        if (/^SET:/im.test(editText)) {
          throw new Error('Remove any "SET:" lines — they\'re not used anymore.');
        }
        await updateDoc(ref, { name: editName.trim(), text: editText.trim() });
        // Question positions may have changed, so clear answers and any shuffle.
        const key = openRef.questionnaireId;
        setAnswersByQ((prev) => ({ ...prev, [key]: {} }));
        setOrderByQ((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setChoiceOrderByQ((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } else {
        const block = buildSingleBlock();
        if (!block) throw new Error("Term, and at least choices A and B, are required.");
        // Transaction: re-read the latest text so we never overwrite someone else's edit.
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new Error("This questionnaire no longer exists.");
          const blocks = splitBlocks(snap.data().text);
          const pos = validBlockPositions(blocks)[editTarget.index];
          if (pos === undefined || questionsIn(blocks[pos])[0]?.term !== editTarget.term) {
            throw new Error("This question was changed elsewhere. Close this and try again.");
          }
          blocks[pos] = block;
          tx.update(ref, { text: blocks.join("\n---\n") });
        });
      }
      setEditTarget(null);
    } catch (err) {
      setSaveError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const answeredCount = Object.keys(answers).length;
  const correctCount = Object.entries(answers).filter(
    ([originalIndex, letter]) => QUESTIONS[originalIndex]?.correct === letter
  ).length;
  const progressPct = QUESTIONS.length > 0 ? Math.round((answeredCount / QUESTIONS.length) * 100) : 0;

  // Once everything is answered, list the wrong ones (in the order they appear on screen).
  const allAnswered = QUESTIONS.length > 0 && answeredCount === QUESTIONS.length;
  const wrongIndices = allAnswered ? order.filter((i) => answers[i] !== QUESTIONS[i]?.correct) : [];

  useEffect(() => {
    setJumpCursor(0);
  }, [qKey, allAnswered]);

  const jumpToWrong = () => {
    if (wrongIndices.length === 0) return;
    const target = wrongIndices[jumpCursor % wrongIndices.length];
    document.getElementById(`q-${target}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashIndex(target);
    setTimeout(() => setFlashIndex(null), 1400);
    setJumpCursor((c) => (c + 1) % wrongIndices.length);
  };

  if (library === null && !loadError) {
    return (
      <div className={"page" + (darkMode ? " dark" : "")}>
        <div className="loadingState">Loading library…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={"page" + (darkMode ? " dark" : "")}>
        <div className="loadingState">
          <p>Couldn't load the library: {loadError}</p>
          <button className="ctrlButton" onClick={() => setRetryKey((k) => k + 1)}>
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
          <button className="iconToggle" onClick={() => setSidebarOpen(true)} aria-label="Open library" title="Library">
            <Icon name="menu" size={20} />
          </button>
          <h1>Quiz for my wifies 📖</h1>
          <button
            className="iconToggle"
            onClick={() => setDarkMode((d) => !d)}
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            <Icon name={darkMode ? "sun" : "moon"} size={19} />
          </button>
        </div>
        <p className="subtitle">Goodluck minamahal kong napakaganda</p>

        {openQuestionnaire && (
          <button
            className="currentSetPill"
            onClick={() => {
              openFolder(openRef.subjectId, openRef.periodName);
              setSidebarOpen(true);
            }}
          >
            <span className="pillText">
              {openSubject.name}
              <Icon name="chevronRight" size={12} className="pillSep" />
              {openRef.periodName}
              <Icon name="chevronRight" size={12} className="pillSep" />
              {openQuestionnaire.name}
            </span>
            <Icon name="chevronDown" size={15} />
          </button>
        )}

        {openQuestionnaire && (
          <div className="controlsRow">
            {QUESTIONS.length > 0 && (
              <>
                <button className="ctrlButton" onClick={handleShuffleQuestions}>
                  <Icon name="shuffle" size={16} />
                  Shuffle questions
                </button>
                <button className="ctrlButton" onClick={handleShuffleChoices}>
                  <Icon name="shuffle" size={16} />
                  Shuffle choices
                </button>
                <button className="ctrlButton" onClick={handleReset} disabled={answeredCount === 0}>
                  <Icon name="reset" size={16} />
                  Reset
                </button>
              </>
            )}
            <button className="ctrlButton" onClick={openAppendModal}>
              <Icon name="plus" size={16} />
              Add question
            </button>
            <button className="ctrlButton" onClick={openRawEdit}>
              <Icon name="pencil" size={15} />
              Edit text
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

      {sidebarOpen && (
        <div className="sidebarOverlay" onClick={() => setSidebarOpen(false)}>
          <aside className="sidebarPanel" onClick={(e) => e.stopPropagation()}>
            <div className="sidebarHeader">
              <div className="breadcrumbs">
                <button className="crumbBtn" onClick={goToRoot}>
                  <Icon name="library" size={16} />
                  Subjects
                </button>
                {currentSubject && (
                  <>
                    <Icon name="chevronRight" size={13} className="crumbSep" />
                    <button className="crumbBtn" onClick={() => openFolder(currentSubject.id, null)}>
                      {currentSubject.name}
                    </button>
                  </>
                )}
                {currentPeriod && (
                  <>
                    <Icon name="chevronRight" size={13} className="crumbSep" />
                    <span className="crumbCurrent">{currentPeriod.name}</span>
                  </>
                )}
              </div>
              <button className="iconToggle" onClick={() => setSidebarOpen(false)} aria-label="Close">
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="sidebarList">
              {!currentSubject &&
                (library.subjects.length === 0 ? (
                  <p className="sidebarEmpty">No subjects yet — add one below.</p>
                ) : (
                  library.subjects.map((subject) => (
                    <div key={subject.id} className="sidebarItem">
                      <button className="sidebarItemMain" onClick={() => openFolder(subject.id, null)}>
                        <span className="sidebarItemLabel">
                          <Icon name="folder" size={16} className="labelIcon" />
                          <span className="labelText">{subject.name}</span>
                        </span>
                        <span className="sidebarItemCount">
                          {subject.periods.reduce((sum, p) => sum + p.questionnaires.length, 0)} questionnaire(s)
                        </span>
                      </button>
                      <button
                        className="sidebarDeleteBtn sidebarEditBtn"
                        onClick={() => {
                          setSaveError(null);
                          setEditSubjectName(subject.name);
                          setEditSubject(subject);
                        }}
                        aria-label={`Rename ${subject.name}`}
                        title="Rename this subject"
                      >
                        <Icon name="pencil" size={16} />
                      </button>
                      <button
                        className="sidebarDeleteBtn"
                        onClick={() => setConfirmDeleteSubject(subject)}
                        aria-label={`Delete ${subject.name}`}
                        title="Delete this subject"
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  ))
                ))}

              {currentSubject &&
                !currentPeriod &&
                currentSubject.periods.map((period) => (
                  <button
                    key={period.name}
                    className="sidebarItem sidebarItemMain folderRow"
                    onClick={() => openFolder(currentSubject.id, period.name)}
                  >
                    <span className="sidebarItemLabel">
                      <Icon name="folder" size={16} className="labelIcon" />
                      <span className="labelText">{period.name}</span>
                    </span>
                    <span className="sidebarItemCount">{period.questionnaires.length} file(s)</span>
                  </button>
                ))}

              {currentPeriod &&
                (currentPeriod.questionnaires.length === 0 ? (
                  <p className="sidebarEmpty">No questionnaires here yet — add one below.</p>
                ) : (
                  currentPeriod.questionnaires.map((q) => (
                    <div
                      key={q.id}
                      className={
                        "sidebarItem" +
                        ((combineMode ? combineSelected.includes(q.id) : openRef?.questionnaireId === q.id)
                          ? " sidebarItemActive"
                          : "")
                      }
                    >
                      {combineMode && (
                        <span
                          className={"combineCheck" + (combineSelected.includes(q.id) ? " combineCheckOn" : "")}
                          aria-hidden="true"
                        >
                          {combineSelected.includes(q.id) && <Icon name="check" size={14} />}
                        </span>
                      )}
                      <button
                        className="sidebarItemMain"
                        onClick={() => {
                          if (combineMode) {
                            toggleCombine(q.id);
                            return;
                          }
                          setOpenRef({
                            subjectId: currentSubject.id,
                            periodName: currentPeriod.name,
                            questionnaireId: q.id,
                          });
                          setSidebarOpen(false);
                        }}
                      >
                        <span className="sidebarItemLabel">
                          <Icon name="file" size={16} className="labelIcon" />
                          <span className="labelText">{q.name}</span>
                        </span>
                        <span className="sidebarItemCount">{questionsIn(q.text).length} question(s)</span>
                      </button>
                      {!combineMode && (
                        <button
                          className="sidebarDeleteBtn"
                          onClick={() =>
                            setConfirmDeleteQuestionnaire({
                              subjectId: currentSubject.id,
                              periodName: currentPeriod.name,
                              questionnaire: q,
                            })
                          }
                          aria-label={`Delete ${q.name}`}
                          title="Delete this questionnaire"
                        >
                          <Icon name="trash" size={17} />
                        </button>
                      )}
                    </div>
                  ))
                ))}
            </div>

            {!currentSubject && (
              <button
                className="ctrlButton sidebarAddBtn"
                onClick={() => {
                  setSaveError(null);
                  setShowNewSubject(true);
                }}
              >
                <Icon name="plus" size={17} />
                New subject
              </button>
            )}
            {currentPeriod && !combineMode && (
              <div className="sidebarActions">
                <button
                  className="ctrlButton sidebarAddBtn"
                  onClick={() => openCreateModal(currentSubject.id, currentPeriod.name)}
                >
                  <Icon name="plus" size={17} />
                  New questionnaire
                </button>
                {currentPeriod.questionnaires.length >= 2 && (
                  <button className="ctrlButton sidebarSecondaryBtn" onClick={() => setCombineMode(true)}>
                    <Icon name="merge" size={17} />
                    Combine
                  </button>
                )}
              </div>
            )}
            {currentPeriod && combineMode && (
              <div className="sidebarActions">
                <button className="ctrlButton sidebarSecondaryBtn" onClick={exitCombine}>
                  Cancel
                </button>
                <button
                  className="ctrlButton sidebarAddBtn"
                  disabled={combineSelected.length < 2}
                  onClick={() => {
                    setSaveError(null);
                    setCombineName("");
                    setShowCombineModal(true);
                  }}
                >
                  <Icon name="merge" size={17} />
                  Combine ({combineSelected.length})
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {showCombineModal && (
        <div className="modalOverlay" onClick={() => !saving && setShowCombineModal(false)}>
          <form className="modalCard" onClick={(e) => e.stopPropagation()} onSubmit={handleCombine}>
            <h2>Combine questionnaires</h2>
            <label>
              New questionnaire name
              <input
                value={combineName}
                onChange={(e) => setCombineName(e.target.value)}
                placeholder="e.g. Midterm mega review"
                autoFocus
              />
            </label>
            <p className="bulkHint">
              Merges {combinePicked.length} questionnaires ({combineQuestionTotal} questions) into a new one in{" "}
              {currentSubject?.name} › {currentPeriod?.name}. The originals stay as they are.
            </p>
            {saveError && <p className="formError">{saveError}</p>}
            <div className="modalActions">
              <button type="button" className="ctrlButton" onClick={() => setShowCombineModal(false)} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="ctrlButton ctrlButtonPrimary" disabled={saving}>
                {saving ? "Combining…" : "Create combined"}
              </button>
            </div>
          </form>
        </div>
      )}

      {editSubject && (
        <div className="modalOverlay" onClick={() => !saving && setEditSubject(null)}>
          <form className="modalCard" onClick={(e) => e.stopPropagation()} onSubmit={handleRenameSubject}>
            <h2>Rename subject</h2>
            <label>
              Subject name
              <input value={editSubjectName} onChange={(e) => setEditSubjectName(e.target.value)} autoFocus />
            </label>
            {saveError && <p className="formError">{saveError}</p>}
            <div className="modalActions">
              <button type="button" className="ctrlButton" onClick={() => setEditSubject(null)} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="ctrlButton ctrlButtonPrimary" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showNewSubject && (
        <div className="modalOverlay" onClick={() => !saving && setShowNewSubject(false)}>
          <form className="modalCard" onClick={(e) => e.stopPropagation()} onSubmit={handleAddSubject}>
            <h2>New subject</h2>
            <label>
              Subject name
              <input
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                placeholder="e.g. Anatomy"
                autoFocus
              />
            </label>
            <p className="bulkHint">
              Creates the subject with Prelim, Midterm, and Finals folders inside automatically.
            </p>
            {saveError && <p className="formError">{saveError}</p>}
            <div className="modalActions">
              <button type="button" className="ctrlButton" onClick={() => setShowNewSubject(false)} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="ctrlButton ctrlButtonPrimary" disabled={saving}>
                {saving ? "Creating…" : "Create subject"}
              </button>
            </div>
          </form>
        </div>
      )}

      {modalTarget && (
        <div className="modalOverlay" onClick={() => !saving && setModalTarget(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <h2>{modalTarget.type === "new" ? "New questionnaire" : "Add questions"}</h2>

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

            <form onSubmit={handleModalSubmit} className="modalForm">
              {modalTarget.type === "new" && (
                <label>
                  Questionnaire name
                  <input
                    value={qFormName}
                    onChange={(e) => setQFormName(e.target.value)}
                    placeholder="e.g. Chapter 1-3"
                    autoFocus
                  />
                </label>
              )}

              {addMode === "single" ? (
                <>
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
                </>
              ) : (
                <>
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
                    Same TERM/A-D/ANSWER/EXPLAIN format, separated by <code>---</code>. Don't include{" "}
                    <code>SET:</code> lines — the subject/period/file structure replaces those now.
                  </p>
                  {bulkText.trim() !== "" && (
                    <p className={"detectedCount" + (detectedCount === 0 ? " detectedCountZero" : "")}>
                      {detectedCount === 0
                        ? "No questions detected yet"
                        : `Detected ${detectedCount} question${detectedCount === 1 ? "" : "s"}`}
                    </p>
                  )}
                </>
              )}

              {saveError && <p className="formError">{saveError}</p>}

              <div className="modalActions">
                <button type="button" className="ctrlButton" onClick={() => setModalTarget(null)} disabled={saving}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ctrlButton ctrlButtonPrimary"
                  disabled={saving || (addMode === "bulk" && detectedCount === 0)}
                >
                  {saving ? "Saving…" : modalTarget.type === "new" ? "Create questionnaire" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="modalOverlay" onClick={() => !saving && setEditTarget(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <h2>{editTarget.type === "raw" ? "Edit questionnaire text" : "Edit question"}</h2>

            <form onSubmit={handleEditSubmit} className="modalForm">
              {editTarget.type === "raw" ? (
                <>
                  <label>
                    Questionnaire name
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </label>
                  <label>
                    Text
                    <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={16} />
                  </label>
                  <p className="bulkHint">
                    Same TERM/A-D/ANSWER/EXPLAIN format, questions separated by <code>---</code>. Delete a
                    whole block to remove a question.
                  </p>
                </>
              ) : (
                <>
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
                </>
              )}

              {saveError && <p className="formError">{saveError}</p>}

              <div className="modalActions">
                <button type="button" className="ctrlButton" onClick={() => setEditTarget(null)} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="ctrlButton ctrlButtonPrimary" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDeleteSubject && (
        <div className="modalOverlay" onClick={() => !saving && setConfirmDeleteSubject(null)}>
          <div className="modalCard confirmCard" onClick={(e) => e.stopPropagation()}>
            <h2>Delete this subject?</h2>
            <p>
              This permanently deletes <strong>"{confirmDeleteSubject.name}"</strong> — all three periods and every
              questionnaire inside — for both of you. This can't be undone.
            </p>
            <div className="modalActions">
              <button className="ctrlButton" onClick={() => setConfirmDeleteSubject(null)} disabled={saving}>
                Cancel
              </button>
              <button
                className="ctrlButton ctrlButtonDanger"
                onClick={() => handleDeleteSubject(confirmDeleteSubject)}
                disabled={saving}
              >
                {saving ? "Deleting…" : "Delete subject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteQuestionnaire && (
        <div className="modalOverlay" onClick={() => !saving && setConfirmDeleteQuestionnaire(null)}>
          <div className="modalCard confirmCard" onClick={(e) => e.stopPropagation()}>
            <h2>Delete this questionnaire?</h2>
            <p>
              This permanently deletes <strong>"{confirmDeleteQuestionnaire.questionnaire.name}"</strong> and every
              question in it, for both of you. This can't be undone.
            </p>
            <div className="modalActions">
              <button className="ctrlButton" onClick={() => setConfirmDeleteQuestionnaire(null)} disabled={saving}>
                Cancel
              </button>
              <button
                className="ctrlButton ctrlButtonDanger"
                onClick={() => handleDeleteQuestionnaire(confirmDeleteQuestionnaire)}
                disabled={saving}
              >
                {saving ? "Deleting…" : "Delete questionnaire"}
              </button>
            </div>
          </div>
        </div>
      )}

      <main>
        {!openQuestionnaire ? (
          <div className="emptySet">
            <h2>Nothing open yet</h2>
            <p>Tap the menu button to browse your subjects and open a questionnaire, or create your first subject.</p>
          </div>
        ) : QUESTIONS.length === 0 ? (
          <div className="emptySet">
            <h2>This questionnaire is empty</h2>
            <p>Use "Add question" above to add some.</p>
          </div>
        ) : (
          order.map((originalIndex) => {
            const q = QUESTIONS[originalIndex];
            if (!q) return null; // guards against a stale shuffle order after edits
            const selected = answers[originalIndex];
            const isAnswered = Boolean(selected);
            const isCorrect = selected === q.correct;

            // Displayed order of this question's choices (shuffled letters map back to originals).
            const stored = choiceOrderByQ[qKey]?.[originalIndex];
            const available = LETTERS.filter((l) => q.choices[l]);
            // Fall back to default if the question was edited and the stored order is stale.
            const choiceOrder =
              stored && stored.length === available.length && stored.every((l) => available.includes(l))
                ? stored
                : available;
            const labelOf = (letter) => LETTERS[choiceOrder.indexOf(letter)];

            return (
              <section
                id={`q-${originalIndex}`}
                className={
                  "card" +
                  (isAnswered ? (isCorrect ? " correctCard" : " wrongCard") : "") +
                  (flashIndex === originalIndex ? " flashCard" : "")
                }
                key={originalIndex}
              >
                <div className="qHeader" style={{ justifyContent: "flex-end" }}>
                  <button className="qEditBtn" onClick={() => openQuestionEdit(originalIndex)}>
                    <Icon name="pencil" size={13} />
                    Edit
                  </button>
                </div>
                <p className="term">{q.term}</p>

                <div className="choices">
                  {choiceOrder.map((letter, pos) => {
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
                        <span className="letter">{LETTERS[pos]}</span>
                        <span className="choiceText">{q.choices[letter]}</span>
                      </button>
                    );
                  })}
                </div>

                {isAnswered && (
                  <div className="feedback">
                    {isCorrect ? (
                      <p className="feedbackCorrect">
                        <Icon name="checkCircle" size={16} className="fbIcon" />
                        Correct! <strong>{labelOf(selected)}</strong>
                      </p>
                    ) : (
                      <>
                        <p className="feedbackWrong">
                          <Icon name="xCircle" size={16} className="fbIcon" />
                          <strong>Your answer: {labelOf(selected)}</strong> — {q.choices[selected]}
                        </p>
                        <p className="feedbackRight">
                          <Icon name="checkCircle" size={16} className="fbIcon" />
                          <strong>Correct answer: {labelOf(q.correct)}</strong> — {q.choices[q.correct]}
                        </p>
                      </>
                    )}
                    {choiceOrder.map((letter, pos) =>
                      q.explanations[letter] ? (
                        <p className="feedbackExplain" key={letter}>
                          <strong>{LETTERS[pos]}:</strong> {q.explanations[letter]}
                        </p>
                      ) : null
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

      <button
        className={"fab fabMenu" + (scrolled ? " fabVisible" : "")}
        onClick={() => setSidebarOpen(true)}
        aria-label="Open library"
        title="Library"
        tabIndex={scrolled ? 0 : -1}
      >
        <Icon name="menu" size={21} />
      </button>

      {wrongIndices.length > 0 && (
        <button className="fab fabJump" onClick={jumpToWrong} aria-label="Jump to a wrong answer">
          <Icon name="alertCircle" size={19} />
          <span>Review {wrongIndices.length} wrong</span>
        </button>
      )}
    </div>
  );
}