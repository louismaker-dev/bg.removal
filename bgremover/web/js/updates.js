/* "New version available" check against GitHub Releases. */
window.UPD = (() => {
  const { h, esc } = U;
  let info = null;

  // very small markdown → html for release notes
  const md = s => esc(s || '').replace(/^## (.*)$/gm, '<b>$1</b>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`(.+?)`/g, '<code>$1</code>').replace(/^- (.*)$/gm, '• $1').replace(/^---$/gm, '<hr>').replace(/\n/g, '<br>');

  async function check({ silent = true } = {}) {
    if (silent && U.lsGet('eg_no_update_check')) return null;
    const r = await API.call('check_update').catch(() => null);
    if (!r || !r.ok) { if (!silent) U.alert('Check for updates', 'Could not reach GitHub. Check your internet connection and try again.'); return null; }
    info = r;
    if (r.newer) {
      banner();
      if (silent && U.lsGet('eg_skip_version') !== r.latest) U.toast(`Update ${r.latest} is available. Click the banner on the home screen or File → Check for updates.`, 'ok', 7000);
      if (!silent) prompt();
    } else if (!silent) {
      U.alert('Check for updates', r.current === 'dev' ? 'This is a development copy, so it is not updated automatically.' : `You're on the latest version (${esc(r.current)}).`);
    }
    return r;
  }

  function banner() {
    const host = document.getElementById('homeUpdate');
    if (!host || !info || !info.newer) return;
    host.innerHTML = '';
    host.append(h('div.update-banner', h('span', { html: U.icon('sparkles') }),
      h('div', h('b', `New version ${info.latest} is ready`), h('div.muted.small', `You have ${info.current}. Your projects, uploads and settings are kept.`)),
      h('button.btn-accent', { onclick: prompt }, 'Update now')));
    U.hydrateIcons(host);
  }

  async function prompt() {
    if (!info || !info.newer) return;
    const mb = info.size ? ` (${Math.round(info.size / 1048576)} MB)` : '';
    const r = await U.modal({ title: `Update to ${info.latest}`, body: `<div class="note" style="max-height:300px;overflow:auto">${md(info.notes)}</div>
      <p class="muted small">The app downloads the update${mb}, closes, swaps the files and opens again by itself. Save your work first.</p>`,
      buttons: [{ label: 'Skip this version', value: 'skip' }, { label: 'Later', value: false }, { label: 'Update now', value: 'go', primary: true }] });
    if (r === 'skip') { U.lsSet('eg_skip_version', info.latest); return; }
    if (r !== 'go') return;
    if (!API.native()) { U.alert('Update', `Download it from <b>${esc(info.page)}</b>`); return; }
    if (!info.url) { API.call('open_path', info.page); return; }
    const res = await API.withProgress(API.call('install_update', info.url), 'Downloading update…');
    if (!res.ok) {
      const go = await U.modal({ title: 'Update failed', body: `<p>${esc(res.error)}</p><p class="muted">You can download it manually from the Releases page instead.</p>`,
        buttons: [{ label: 'Close', value: false }, { label: 'Open download page', value: true, primary: true }] });
      if (go) API.call('open_path', info.page);
    } else U.busy('Restarting with the new version…');
  }

  return { check, banner, prompt, get info() { return info; } };
})();
