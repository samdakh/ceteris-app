/* Ceteris instructor administration: sections and their students, instructor accounts
   (admin only), and your own account. Loaded before the main script, which calls
   window.CeterisAdmin(helpers). */
window.CeterisAdmin = function (C) {
  'use strict';
  const { iapi, escapeHtml, state } = C;
  const dashBody = () => document.getElementById('dash-body');
  const shortDate = d => new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' });

  // Two-click confirm on a small button.
  function confirmButton(b, label, confirmLabel, action) {
    let timer;
    b.onclick = async () => {
      if (!b.classList.contains('confirm')) {
        b.classList.add('confirm'); b.textContent = confirmLabel;
        timer = setTimeout(() => { b.classList.remove('confirm'); b.textContent = label; }, 4000);
        return;
      }
      clearTimeout(timer);
      b.disabled = true;
      try { await action(); } catch (e) { b.disabled = false; b.classList.remove('confirm'); b.textContent = label; alertIn(b, e.message); }
    };
  }
  function alertIn(el, msg) {
    const box = el.closest('.box') || dashBody();
    let err = box.querySelector('.inline-err');
    if (!err) { err = document.createElement('div'); err.className = 'form-error inline-err'; err.setAttribute('role', 'alert'); box.appendChild(err); }
    err.textContent = msg;
  }

  // ===================================================================================
  // Sections & students

  let currentSection = null;

  async function renderSections(selectId) {
    const body = dashBody();
    body.innerHTML = '<div class="empty-state">Loading sections…</div>';
    let sections;
    try { sections = (await iapi('/api/sections')).sections; } catch (e) { body.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }
    await C.reloadMe();
    if (selectId) currentSection = selectId;
    if (!sections.find(s => s.id === currentSection)) currentSection = sections.length ? sections[0].id : null;
    body.innerHTML = `
      <div class="sec-grid">
        <div class="sec-side">
          <h2 class="sec-h">Your sections</h2>
          ${sections.length ? `<ul class="sec-list">${sections.map(s => `
            <li><button class="sec-item${s.id === currentSection ? ' active' : ''}" data-sec="${s.id}" aria-current="${s.id === currentSection}">
              <span class="sec-name">${escapeHtml(s.name)}</span>
              <span class="sec-meta">${s.students} student${s.students === 1 ? '' : 's'}${s.instructors.length > 1 ? ` · ${s.instructors.length} instructors` : ''}</span>
            </button></li>`).join('')}</ul>` : '<p class="help">No sections yet. Create one for each course section you teach; then add its students.</p>'}
          <form class="box sec-new" id="sec-new">
            <label class="ef-label" for="sec-new-name" style="margin-top:0">New section</label>
            <input class="ef-input" id="sec-new-name" maxlength="120" placeholder="e.g. ECO 201-01 (Fall 2026)">
            <button class="role-btn primary" type="submit">Create section</button>
            <div class="form-error" id="sec-new-err" hidden></div>
          </form>
        </div>
        <div class="sec-main" id="sec-main">${sections.length ? '' : '<div class="box"><h2>Getting started</h2><p class="help" style="margin:0">Create a section on the left, then paste its students’ IDs. Students can log in once they’re in at least one section. A student can be in several sections, and a section can have several instructors.</p></div>'}</div>
      </div>`;
    body.querySelectorAll('[data-sec]').forEach(b => { b.onclick = () => renderSections(+b.dataset.sec); });
    document.getElementById('sec-new').onsubmit = async e => {
      e.preventDefault();
      const name = document.getElementById('sec-new-name').value.trim();
      const err = document.getElementById('sec-new-err');
      if (!name) { err.textContent = 'Name the section first.'; err.hidden = false; return; }
      try { const r = await iapi('/api/sections', { method: 'POST', body: { name } }); renderSections(r.id); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; }
    };
    if (currentSection) renderSectionDetail(sections.find(s => s.id === currentSection));
  }

  async function renderSectionDetail(sec) {
    const main = document.getElementById('sec-main');
    const me = state.me;
    let all = [];
    try { all = (await iapi('/api/instructors')).instructors; } catch (e) {}
    const addable = all.filter(i => !sec.instructors.some(x => x.id === i.id));
    main.innerHTML = `
      <div class="box sec-head">
        <div class="sec-title-row">
          <h2 id="sec-title">${escapeHtml(sec.name)}</h2>
          <button class="link-btn plain" id="sec-rename">Rename</button>
        </div>
        <div class="sec-teachers">
          <span class="small-label" style="margin:0">Taught by</span>
          ${sec.instructors.map(i => `<span class="teacher-chip">${escapeHtml(i.name)}${i.id === me.id ? ' (you)' : ''}${sec.instructors.length > 1 ? ` <button class="chip-x" data-unteach="${i.id}" aria-label="Remove ${escapeHtml(i.name)} from this section">×</button>` : ''}</span>`).join('')}
          ${addable.length ? `<span class="add-teacher"><label class="sr-only" for="teach-pick">Add an instructor</label>
            <select class="select" id="teach-pick"><option value="">Add an instructor…</option>${addable.map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('')}</select></span>` : ''}
        </div>
        <p class="dash-note" style="margin:10px 0 0">Every instructor of a section sees its students’ conversations, notes and essays.</p>
      </div>
      <div class="sec-body">
        <div class="box sec-add">
          <h2>Add students</h2>
          <p class="help">Paste one student per line: the 6-character ID, optionally followed by a comma and the student's name. Two columns copied from a spreadsheet work too. A student already in another section is simply added here as well.</p>
          <label for="roster-input" class="sr-only">Student IDs</label>
          <textarea id="roster-input" class="roster-input" rows="5" placeholder="A1B2C3, Jordan Lee&#10;D4E5F6, Sam Ortiz&#10;G7H8J9"></textarea>
          <div class="roster-actions"><button class="role-btn primary" id="roster-add">Add to ${escapeHtml(sec.name)}</button></div>
          <div class="roster-result" id="roster-result" role="status"></div>
        </div>
        <div id="roster-list"><div class="empty-state">Loading students…</div></div>
      </div>`;
    document.getElementById('sec-rename').onclick = () => {
      const h = document.getElementById('sec-title');
      h.outerHTML = `<form id="rename-form" class="rename-form"><label class="sr-only" for="rename-input">Section name</label><input class="ef-input" id="rename-input" maxlength="120"><button class="role-btn primary" type="submit">Save</button></form>`;
      const inp = document.getElementById('rename-input'); inp.value = sec.name; inp.focus(); inp.select();
      document.getElementById('sec-rename').hidden = true;
      document.getElementById('rename-form').onsubmit = async e => {
        e.preventDefault();
        try { await iapi(`/api/sections/${sec.id}`, { method: 'PUT', body: { name: inp.value } }); renderSections(sec.id); }
        catch (ex) { alertIn(inp, ex.message); }
      };
    };
    const pick = document.getElementById('teach-pick');
    if (pick) pick.onchange = async () => {
      if (!pick.value) return;
      try { await iapi(`/api/sections/${sec.id}/instructors`, { method: 'POST', body: { instructorId: +pick.value } }); renderSections(sec.id); }
      catch (ex) { alertIn(pick, ex.message); }
    };
    main.querySelectorAll('[data-unteach]').forEach(b => {
      b.onclick = async () => {
        const id = +b.dataset.unteach;
        if (id === me.id && !window.confirm('Remove yourself from this section? You will no longer see its students.')) return;
        try { await iapi(`/api/sections/${sec.id}/instructors/${id}`, { method: 'DELETE' }); renderSections(id === me.id ? null : sec.id); }
        catch (ex) { alertIn(b, ex.message); }
      };
    });
    document.getElementById('roster-add').onclick = () => addStudents(sec);
    loadSectionStudents(sec);
  }

  async function addStudents(sec) {
    const input = document.getElementById('roster-input');
    const result = document.getElementById('roster-result');
    const btn = document.getElementById('roster-add');
    if (!input.value.trim()) { result.textContent = 'Paste at least one student ID first.'; return; }
    btn.disabled = true;
    try {
      const r = await iapi('/api/roster', { method: 'POST', body: { text: input.value, sectionId: sec.id } });
      const parts = [];
      if (r.added) parts.push(`Added ${r.added} student${r.added === 1 ? '' : 's'}.`);
      if (r.updated) parts.push(`${r.updated} already in this section (names updated).`);
      if (!r.added && !r.updated) parts.push('No valid IDs found.');
      result.innerHTML = escapeHtml(parts.join(' ')) + (r.invalid.length
        ? `<div class="warn">Skipped ${r.invalid.length} line${r.invalid.length === 1 ? '' : 's'} without a valid 6-character ID: ${r.invalid.slice(0, 5).map(escapeHtml).join('; ')}${r.invalid.length > 5 ? '…' : ''}</div>` : '');
      if (r.added || r.updated) input.value = '';
      btn.disabled = false;
      loadSectionStudents(sec, true);
    } catch (e) { result.textContent = e.message; btn.disabled = false; }
  }

  async function loadSectionStudents(sec, refreshCount) {
    const list = document.getElementById('roster-list');
    let rows;
    try { rows = (await iapi(`/api/roster?section=${sec.id}`)).rows || []; }
    catch (e) { if (list) list.innerHTML = `<div class="empty-state">Couldn't load the students.</div>`; return; }
    if (!list || !list.isConnected) return;
    if (refreshCount) {
      const item = document.querySelector(`[data-sec="${sec.id}"] .sec-meta`);
      if (item) item.textContent = `${rows.length} student${rows.length === 1 ? '' : 's'}${sec.instructors.length > 1 ? ` · ${sec.instructors.length} instructors` : ''}`;
    }
    if (!rows.length) {
      list.innerHTML = `<div class="box"><h2>Students</h2><p class="help" style="margin:0 0 14px;">No students in this section yet.</p>
        <button class="remove-btn" id="sec-delete">Delete this section</button></div>`;
      confirmButton(document.getElementById('sec-delete'), 'Delete this section', 'Confirm delete', async () => {
        await iapi(`/api/sections/${sec.id}`, { method: 'DELETE' }); currentSection = null; renderSections();
      });
      return;
    }
    list.innerHTML = `
      <h2 style="font-size:18px;margin:0 0 12px;">Students <span class="dash-note">(${rows.length})</span></h2>
      <div class="table-scroll"><table class="data-table">
        <thead><tr><th>ID</th><th>Name</th><th>Password</th><th>Last active</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${rows.map(r => {
          const others = r.sections.filter(s => s.id !== sec.id);
          return `<tr>
          <td class="mono">${escapeHtml(r.studentId)}</td>
          <td><span class="${r.name ? '' : 'muted'}">${escapeHtml(r.name || 'no name')}</span>${others.length ? `<div class="sub-id">also in ${others.map(s => escapeHtml(s.name)).join(', ')}</div>` : ''}</td>
          <td class="${r.passwordSetAt ? '' : 'muted'}">${r.passwordSetAt ? 'Set ' + escapeHtml(shortDate(r.passwordSetAt)) : 'Not yet'}</td>
          <td class="${r.lastSeen ? '' : 'muted'}">${escapeHtml(r.lastSeen || 'never')}</td>
          <td class="roster-btns">${r.passwordSetAt ? `<button class="remove-btn" data-reset="${escapeHtml(r.studentId)}">Reset password</button>` : ''}<button class="remove-btn" data-remove="${escapeHtml(r.studentId)}">Remove</button></td></tr>`;
        }).join('')}
        </tbody></table></div>
      <p class="dash-note" style="margin-top:10px;">Students create a password the first time they log in. <strong>Reset password</strong> logs the student out everywhere; they create a new password the next time they log in, so reset only when they ask, and tell them to log in soon. <strong>Remove</strong> takes the student out of this section only; a student in no section can’t log in. Their past work stays in your reports.</p>`;
    list.querySelectorAll('[data-reset]').forEach(b => confirmButton(b, 'Reset password', 'Confirm reset', async () => {
      await iapi(`/api/roster/${encodeURIComponent(b.dataset.reset)}/reset-password`, { method: 'POST' }); loadSectionStudents(sec);
    }));
    list.querySelectorAll('[data-remove]').forEach(b => confirmButton(b, 'Remove', 'Confirm remove', async () => {
      await iapi(`/api/sections/${sec.id}/students/${encodeURIComponent(b.dataset.remove)}`, { method: 'DELETE' }); loadSectionStudents(sec, true);
    }));
  }

  // ===================================================================================
  // Instructors (admin)

  async function renderInstructors(flash) {
    const body = dashBody();
    body.innerHTML = '<div class="empty-state">Loading instructors…</div>';
    let list, sections;
    try {
      list = (await iapi('/api/instructors')).instructors;
      sections = (await iapi('/api/sections?all=1')).sections;
    } catch (e) { body.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; return; }
    const me = state.me;
    body.innerHTML = `
      ${flash ? `<p class="ef-note">${escapeHtml(flash)}</p>` : ''}
      <div class="roster-grid">
        <form class="box" id="inst-add">
          <h2>Add an instructor</h2>
          <p class="help">They log in with this username and create their own password the first time. Then they can create sections, or you can add them to sections below.</p>
          <label class="ef-label" for="inst-user">Username <span class="ef-hint">an email address works</span></label>
          <input class="ef-input" id="inst-user" maxlength="60" autocomplete="off" autocapitalize="none" spellcheck="false">
          <label class="ef-label" for="inst-name">Name students see</label>
          <input class="ef-input" id="inst-name" maxlength="80" placeholder="e.g. Prof. Rivera">
          <label class="check-row"><input type="checkbox" id="inst-admin"> Admin (can manage instructor accounts)</label>
          <div class="form-error" id="inst-err" hidden></div>
          <div class="roster-actions"><button class="role-btn primary" type="submit">Add instructor</button></div>
        </form>
        <div>
          <h2 style="font-size:18px;margin:0 0 12px;">Instructors <span class="dash-note">(${list.length})</span></h2>
          <div class="table-scroll"><table class="data-table">
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Password</th><th>Sections</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>${list.map(i => `<tr>
              <td>${escapeHtml(i.name)}${i.id === me.id ? ' <span class="dash-note">(you)</span>' : ''}</td>
              <td class="mono">${escapeHtml(i.username)}</td>
              <td>${i.isAdmin ? 'Admin' : 'Instructor'}${i.id !== me.id ? ` <button class="link-btn plain" data-admin="${i.id}" data-to="${!i.isAdmin}">${i.isAdmin ? 'make instructor' : 'make admin'}</button>` : ''}</td>
              <td class="${i.passwordSet ? '' : 'muted'}">${i.passwordSet ? 'Set' : 'Not yet'}</td>
              <td>${i.sections.length ? i.sections.map(s => escapeHtml(s.name)).join(', ') : '<span class="muted">none</span>'}</td>
              <td class="roster-btns">${i.id !== me.id ? `${i.passwordSet ? `<button class="remove-btn" data-ireset="${i.id}">Reset password</button>` : ''}<button class="remove-btn" data-iremove="${i.id}">Remove</button>` : ''}</td>
            </tr>`).join('')}</tbody></table></div>
        </div>
      </div>
      <div class="box">
        <h2>All sections</h2>
        <p class="help">As an admin you can assign any instructor to any section, including yourself. Sections can share instructors.</p>
        ${sections.length ? `<div class="table-scroll"><table class="data-table">
          <thead><tr><th>Section</th><th>Students</th><th>Instructors</th></tr></thead>
          <tbody>${sections.map(s => {
            const addable = list.filter(i => !s.instructors.some(x => x.id === i.id));
            return `<tr><td>${escapeHtml(s.name)}</td><td>${s.students}</td><td class="sec-teachers">
              ${s.instructors.length ? s.instructors.map(i => `<span class="teacher-chip">${escapeHtml(i.name)} <button class="chip-x" data-sunteach="${s.id}:${i.id}" aria-label="Remove ${escapeHtml(i.name)} from ${escapeHtml(s.name)}">×</button></span>`).join('') : '<span class="muted">no instructor</span>'}
              ${addable.length ? `<select class="select" data-steach="${s.id}" aria-label="Add an instructor to ${escapeHtml(s.name)}"><option value="">Add…</option>${addable.map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('')}</select>` : ''}
            </td></tr>`;
          }).join('')}</tbody></table></div>` : '<p class="help" style="margin:0">No sections yet.</p>'}
      </div>`;
    document.getElementById('inst-add').onsubmit = async e => {
      e.preventDefault();
      const err = document.getElementById('inst-err');
      try {
        await iapi('/api/instructors', { method: 'POST', body: { username: document.getElementById('inst-user').value, name: document.getElementById('inst-name').value, isAdmin: document.getElementById('inst-admin').checked } });
        renderInstructors(`Added. Send them the link to Ceteris and their username (${document.getElementById('inst-user').value.trim().toLowerCase()}); they’ll create a password when they first log in.`);
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    };
    body.querySelectorAll('[data-admin]').forEach(b => {
      b.onclick = async () => {
        try { await iapi(`/api/instructors/${b.dataset.admin}`, { method: 'PUT', body: { isAdmin: b.dataset.to === 'true' } }); renderInstructors(); }
        catch (ex) { alertIn(b, ex.message); }
      };
    });
    body.querySelectorAll('[data-ireset]').forEach(b => confirmButton(b, 'Reset password', 'Confirm reset', async () => {
      await iapi(`/api/instructors/${b.dataset.ireset}/reset-password`, { method: 'POST' }); renderInstructors('Password reset. They’ll create a new one the next time they log in.');
    }));
    body.querySelectorAll('[data-iremove]').forEach(b => confirmButton(b, 'Remove', 'Confirm remove', async () => {
      await iapi(`/api/instructors/${b.dataset.iremove}`, { method: 'DELETE' }); renderInstructors('Instructor removed. Their sections and students stay.');
    }));
    body.querySelectorAll('[data-steach]').forEach(sel => {
      sel.onchange = async () => {
        if (!sel.value) return;
        try { await iapi(`/api/sections/${sel.dataset.steach}/instructors`, { method: 'POST', body: { instructorId: +sel.value } }); await C.reloadMe(); renderInstructors(); }
        catch (ex) { alertIn(sel, ex.message); }
      };
    });
    body.querySelectorAll('[data-sunteach]').forEach(b => {
      b.onclick = async () => {
        const [sid, iid] = b.dataset.sunteach.split(':');
        try { await iapi(`/api/sections/${sid}/instructors/${iid}`, { method: 'DELETE' }); await C.reloadMe(); renderInstructors(); }
        catch (ex) { alertIn(b, ex.message); }
      };
    });
  }

  // ===================================================================================
  // Your account

  function renderAccount(flash) {
    const body = dashBody();
    const me = state.me;
    body.innerHTML = `
      ${flash ? `<p class="ef-note">${escapeHtml(flash)}</p>` : ''}
      <div class="roster-grid">
        <form class="box" id="acct-form">
          <h2>Your account</h2>
          <label class="ef-label" for="acct-name">Name students see <span class="ef-hint">on your notes, e.g. Prof. Dakhlia</span></label>
          <input class="ef-input" id="acct-name" maxlength="80">
          <label class="ef-label" for="acct-user">Username</label>
          <input class="ef-input" id="acct-user" maxlength="60" autocomplete="username" autocapitalize="none" spellcheck="false">
          <div class="form-error" id="acct-err" hidden></div>
          <div class="roster-actions"><button class="role-btn primary" type="submit">Save</button></div>
        </form>
        <form class="box" id="pw-form">
          <h2>Change your password</h2>
          ${me.usesSetupPassword ? '<p class="ef-warn">You’re logging in with the setup password from the server settings (INSTRUCTOR_PASSWORD). Choose your own password; after that, the setup password no longer works for your account.</p>' : ''}
          <label class="ef-label" for="pw-cur">Current password</label>
          <input class="ef-input" id="pw-cur" type="password" autocomplete="current-password">
          <label class="ef-label" for="pw-new">New password <span class="ef-hint">at least 10 characters</span></label>
          <input class="ef-input" id="pw-new" type="password" autocomplete="new-password">
          <label class="ef-label" for="pw-new2">Type it again</label>
          <input class="ef-input" id="pw-new2" type="password" autocomplete="new-password">
          <div class="form-error" id="pw-err" hidden></div>
          <div class="roster-actions"><button class="role-btn primary" type="submit">Change password</button></div>
        </form>
      </div>`;
    document.getElementById('acct-name').value = me.name;
    document.getElementById('acct-user').value = me.username;
    document.getElementById('acct-form').onsubmit = async e => {
      e.preventDefault();
      const err = document.getElementById('acct-err');
      try {
        await iapi('/api/instructor/me', { method: 'PUT', body: { name: document.getElementById('acct-name').value, username: document.getElementById('acct-user').value } });
        await C.reloadMe(); C.refreshHeader();
        try { localStorage.setItem('ceterisInstructorUser', state.me.username); } catch (x) {}
        renderAccount('Saved.');
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    };
    document.getElementById('pw-form').onsubmit = async e => {
      e.preventDefault();
      const err = document.getElementById('pw-err');
      const n1 = document.getElementById('pw-new').value, n2 = document.getElementById('pw-new2').value;
      if (n1 !== n2) { err.textContent = 'The two new passwords don’t match.'; err.hidden = false; return; }
      try {
        await iapi('/api/instructor/me', { method: 'PUT', body: { currentPassword: document.getElementById('pw-cur').value, newPassword: n1 } });
        await C.reloadMe();
        renderAccount('Password changed.');
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    };
  }

  return { renderSections, renderInstructors, renderAccount };
};
