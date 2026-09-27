import { getStore } from "@netlify/blobs";

const KEY = "questions.txt";

// Optional lightweight protection: if you set a QUIZ_EDIT_KEY env var in
// Netlify's site settings, POST/PUT requests must include a matching
// "x-quiz-key" header. GET (reading) is always open. If you never set the
// env var, this check is skipped entirely and anyone can add questions.
function isAuthorized(req) {
  const required = process.env.QUIZ_EDIT_KEY;
  if (!required) return true;
  return req.headers.get("x-quiz-key") === required;
}

// Inserts a new question block into the given SET section (creating the
// section at the end of the file if it doesn't exist yet).
function insertQuestion(fullText, setLabel, blockText) {
  const lines = fullText.split(/\r?\n/);
  const targetLabel = setLabel.trim().toLowerCase();

  let setStart = -1;
  let nextSetStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.toUpperCase().startsWith("SET:")) {
      const label = line.slice(4).trim().toLowerCase();
      if (setStart === -1 && label === targetLabel) {
        setStart = i;
      } else if (setStart !== -1 && nextSetStart === -1) {
        nextSetStart = i;
        break;
      }
    }
  }

  const newBlock = blockText.trim() + "\n---\n";

  if (setStart === -1) {
    // Set doesn't exist yet — create it at the end of the file.
    const sep = fullText.trim().length > 0 ? "\n\n" : "";
    return fullText.trimEnd() + `${sep}SET: ${setLabel.trim()}\n${newBlock}`;
  }

  const insertAt = nextSetStart === -1 ? lines.length : nextSetStart;
  const before = lines.slice(0, insertAt).join("\n").trimEnd();
  const after = lines.slice(insertAt).join("\n");
  return before + "\n" + newBlock + (after ? "\n" + after : "\n");
}

// Removes an entire SET section (its header line and every question inside
// it) from the stored text.
function removeSet(fullText, setLabel) {
  const lines = fullText.split(/\r?\n/);
  const targetLabel = setLabel.trim().toLowerCase();

  let setStart = -1;
  let nextSetStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.toUpperCase().startsWith("SET:")) {
      const label = line.slice(4).trim().toLowerCase();
      if (setStart === -1 && label === targetLabel) {
        setStart = i;
      } else if (setStart !== -1 && nextSetStart === -1) {
        nextSetStart = i;
        break;
      }
    }
  }

  if (setStart === -1) return fullText; // set not found — no-op

  const endIdx = nextSetStart === -1 ? lines.length : nextSetStart;
  const remaining = [...lines.slice(0, setStart), ...lines.slice(endIdx)].join("\n");
  return remaining.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export default async (req) => {
  const store = getStore("quiz-questions");

  if (req.method === "GET") {
    const text = (await store.get(KEY)) || "";
    return new Response(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (req.method === "POST") {
    if (!isAuthorized(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }
    const { set, block } = body || {};
    if (!set || !block) {
      return new Response("Missing 'set' or 'block'", { status: 400 });
    }
    const existing = (await store.get(KEY)) || "";
    const updated = insertQuestion(existing, set, block);
    await store.set(KEY, updated);
    return new Response(updated, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (req.method === "PUT") {
    // Full replace — used once by the "Import existing questions" button
    // to seed the store from the bundled questions.txt.
    if (!isAuthorized(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const text = await req.text();
    await store.set(KEY, text);
    return new Response(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (req.method === "DELETE") {
    if (!isAuthorized(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }
    const { set } = body || {};
    if (!set) {
      return new Response("Missing 'set'", { status: 400 });
    }
    const existing = (await store.get(KEY)) || "";
    const updated = removeSet(existing, set);
    await store.set(KEY, updated);
    return new Response(updated, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = {
  path: "/.netlify/functions/questions",
};