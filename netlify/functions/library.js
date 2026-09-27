import { getStore } from "@netlify/blobs";

const KEY = "library.json";
const PERIODS = ["Prelim", "Midterm", "Finals"];

// Optional lightweight protection: set QUIZ_EDIT_KEY in Netlify's env vars
// to require a matching "x-quiz-key" header on every write. GET (reading)
// is always open. Skipped entirely if the env var isn't set.
function isAuthorized(req) {
  const required = process.env.QUIZ_EDIT_KEY;
  if (!required) return true;
  return req.headers.get("x-quiz-key") === required;
}

function emptyLibrary() {
  return { subjects: [] };
}

function findSubject(library, subjectId) {
  return library.subjects.find((s) => s.id === subjectId);
}

function findPeriod(subject, periodName) {
  return subject?.periods.find((p) => p.name === periodName);
}

export default async (req) => {
  const store = getStore("quiz-library");

  if (req.method === "GET") {
    const raw = await store.get(KEY);
    const library = raw ? JSON.parse(raw) : emptyLibrary();
    return new Response(JSON.stringify(library), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!isAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const raw = await store.get(KEY);
  const library = raw ? JSON.parse(raw) : emptyLibrary();
  const { action } = body || {};

  const respond = async () => {
    await store.set(KEY, JSON.stringify(library));
    return new Response(JSON.stringify(library), {
      headers: { "Content-Type": "application/json" },
    });
  };

  if (action === "addSubject") {
    const name = (body.name || "").trim();
    if (!name) return new Response("Missing subject name", { status: 400 });
    library.subjects.push({
      id: crypto.randomUUID(),
      name,
      periods: PERIODS.map((p) => ({ name: p, questionnaires: [] })),
    });
    return respond();
  }

  if (action === "deleteSubject") {
    const { subjectId } = body;
    library.subjects = library.subjects.filter((s) => s.id !== subjectId);
    return respond();
  }

  if (action === "addQuestionnaire") {
    const { subjectId, periodName, name, text } = body;
    const subject = findSubject(library, subjectId);
    if (!subject) return new Response("Subject not found", { status: 404 });
    const period = findPeriod(subject, periodName);
    if (!period) return new Response("Period not found", { status: 404 });
    period.questionnaires.push({
      id: crypto.randomUUID(),
      name: (name || "").trim() || "Untitled questionnaire",
      text: (text || "").trim(),
    });
    return respond();
  }

  if (action === "appendToQuestionnaire") {
    const { subjectId, periodName, questionnaireId, block } = body;
    const subject = findSubject(library, subjectId);
    const period = findPeriod(subject, periodName);
    const questionnaire = period?.questionnaires.find((q) => q.id === questionnaireId);
    if (!questionnaire) return new Response("Questionnaire not found", { status: 404 });
    questionnaire.text =
      (questionnaire.text ? questionnaire.text.trim() + "\n---\n" : "") + (block || "").trim();
    return respond();
  }

  if (action === "deleteQuestionnaire") {
    const { subjectId, periodName, questionnaireId } = body;
    const subject = findSubject(library, subjectId);
    const period = findPeriod(subject, periodName);
    if (period) {
      period.questionnaires = period.questionnaires.filter((q) => q.id !== questionnaireId);
    }
    return respond();
  }

  return new Response("Unknown action", { status: 400 });
};

export const config = {
  path: "/.netlify/functions/library",
};