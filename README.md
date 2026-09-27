# Quiz app — GitHub + Netlify deployment guide

## What's in this project
- `src/questions.txt` — your question bank. This is the ONLY file you edit to add questions.
- `src/parser.js` — reads questions.txt and turns it into data. Never needs editing.
- `src/App.jsx` — the quiz UI. Never needs editing to add/remove questions.
- `src/index.css` — styling.
- `netlify.toml` — tells Netlify how to build the site.

## Adding questions
Open `src/questions.txt` and keep repeating this pattern:

```
TERM: your question here
A) choice
B) choice
C) choice
D) choice
ANSWER: B
EXPLAIN A: why A is wrong
EXPLAIN B: why B is right
EXPLAIN C: why C is wrong
EXPLAIN D: why D is wrong
---
```

Start a new tab/page of questions with a line like `SET: Questions 1-50`.
Separate every question with a line containing only `---`.
Blank lines are fine — space things out however's readable.

## Step 1 — Push to GitHub
1. Create a new repository on github.com (public or private, either works).
2. In this project folder, run:
   ```
   git init
   git add .
   git commit -m "Initial quiz app"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
   git push -u origin main
   ```

## Step 2 — Connect to Netlify
1. Go to https://app.netlify.com and log in (GitHub login works).
2. Click "Add new site" → "Import an existing project".
3. Choose GitHub, then select your repository.
4. Netlify will auto-detect the settings from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Click "Deploy site".

That's it — Netlify builds and hosts it automatically. Every time you push new
questions to GitHub (edit questions.txt → commit → push), Netlify rebuilds and
redeploys the live site within a minute or two, with no manual steps.

## Local preview (optional)
If you want to see changes before pushing:
```
npm install
npm run dev
```
Then open the local URL it prints in your browser.
