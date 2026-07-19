Handoff: geebr.world HTML note feature + follow-up tasks

CURRENT STATE (committed and pushed)
Commit bc6e44d on main (repo github.com/runvnc/geebr.world). All files pass deno check.

Implemented: note(html) agent command.
- app.js: makeNote(scene,x,z,html) creates a thin paper prop (0.6 x 0.82 box). renderNoteTexture() renders the HTML into a BABYLON.DynamicTexture via SVG foreignObject -> Image -> canvas, with a plain-text fallback. noteTextFromHtml() strips tags via a temp DOM node.
- note(g,html) action inscribes the note about 1 tile in front of the geebr.
- Wired into: COMMANDS list, parseCommand, parseLLMCommandLine, executeGameCommandImmediate switch (case note), LLM grammar (note(html) in llm_js/grammar.js geebrCommands), agent prompt examples (buildCommandExamples), click-to-spawn palette (index.html spawnModeType), and save/restore persistence (noteHtml/noteText serialized in props).
- carry() hook: when a geebr picks up a note it says the note RAW TEXT (tags stripped) instead of the usual quip.

REMAINING TASKS (requested, not yet done)

1) Fix broken external images in notes
User tried note() with an img tag pointing at https://www.wikipedia.org/portal/wikipedia.org/assets/img/Wikipedia-logo-v2.png and got a broken image. Cause: SVG foreignObject rasterized to canvas CANNOT load external resources (browser security rule); remote img URLs inside the SVG are blocked.
Fix plan: in renderNoteTexture() (app.js around line 522), BEFORE building the SVG, find all external image URLs in the HTML, fetch() each, convert the blob to a data: URL (FileReader.readAsDataURL), and rewrite the src attributes with the data URLs. Then rasterize the rewritten HTML. Wikipedia/Wikimedia send permissive CORS headers so fetch succeeds; hosts that block CORS still will not work (drop the img and keep an alt placeholder in that case).
Sketch:
  async function inlineNoteImages(html){
    const d=document.createElement('div'); d.innerHTML=String(html||'');
    const imgs=Array.from(d.querySelectorAll('img'));
    await Promise.all(imgs.map(async im=>{
      const src=im.getAttribute('src')||'';
      if(!/^https?:/i.test(src)) return;
      try{ const r=await fetch(src,{mode:'cors'}); const b=await r.blob();
        im.src=await new Promise(res=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(b); });
      }catch(e){ im.alt='[image unavailable]'; im.removeAttribute('src'); }
    }));
    return d.innerHTML;
  }
Keep renderNoteTexture sync (it is called from makeNote): draw the text fallback immediately so the note appears instantly, then kick off the async inline+render as fire-and-forget; when inlineNoteImages resolves, rebuild the SVG and call tex.update().

2) Add a REAL command box
setupUI() (app.js around line 1598) references document.getElementById('cmd') but NO element with id cmd exists in index.html: dead code. Right now arbitrary commands only run via the browser console (runCommand("note(<p>hi</p>)") or runAgentCommand("geebr1","note(<p>hi</p>)")) or via data-cmd buttons.
Task: add a visible text input (user approved; suggested location: chat dock #chatDock at index.html around line 147, or the left panel) that on Enter calls runCommand(value). Keep it distinct from #chatInput (which talks TO the agent brain). Suggested: a second small input in the chat dock with placeholder text like: command e.g. note(<p>hi</p>). Also remove or fix the dead #cmd handler.

3) Validate and commit
Run: deno check app.js and deno check llm_js/grammar.js (node is NOT installed on this machine; deno is; no output means pass). Commit to main and push.

EDITING GOTCHAS (IMPORTANT)
- app.js has long minified-style lines: use python string replace with assert s.count(old)==1. Do NOT use apply_udiff on app.js.
- The agent system prompt demands: respond with EXACTLY ONE JSON array of commands, no plain text outside it, and use the literal START_RAW/END_RAW delimiters for multiline strings. The previous session had a long streak of parse errors caused by emitting stray text or bare dashes outside the array; be strict and output only the array.
